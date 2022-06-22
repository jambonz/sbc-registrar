const debug = require('debug')('jambonz:sbc-registrar');
const assert = require('assert');
const DEFAULT_EXPIRES = 3600;

const regbots = [];
const carriers = [];
const gateways = [];

class Regbot {
  constructor(logger, opts) {
    this.logger = logger;

    ['ipv4', 'port', 'username', 'password', 'sip_realm'].forEach((prop) => this[prop] = opts[prop]);

    this.username = opts.username;
    this.password = opts.password;
    this.sip_realm = opts.sip_realm || opts.ipv4;
    this.ipv4 = opts.ipv4;
    this.port = opts.port;
    this.aor = `${this.username}@${this.sip_realm}`;
    this.status = 'none';
  }

  start(srf) {
    assert(!this.timer);
    this.register(srf);
  }

  stop() {
    assert(this.timer);
    clearTimeout(this.timer);
  }

  toJSON() {
    return {
      username: this.username,
      sip_realm: this.sip_realm,
      ipv4: this.ipv4,
      port: this.port,
      aor: this.aor,
      status: this.status
    };
  }

  async register(srf) {
    try {
      const req = await srf.request(`sip:${this.aor}`, {
        method: 'REGISTER',
        proxy: `sip:${this.ipv4}:${this.port}`,
        headers: {
          'From': `sip:${this.aor}`,
          'Contact': `<sip:${this.aor}>;expires=${DEFAULT_EXPIRES}`,
          'Expires': DEFAULT_EXPIRES
        },
        auth: {
          username: this.username,
          password: this.password
        }
      });
      req.on('response', (res) => {
        if (res.status !== 200) {
          this.status = 'fail';
          this.logger.info(`Regbot: got ${res.status} registering to ${this.sip_realm} at ${this.ipv4}:${this.port}`);
          this.timer = setTimeout(this.register.bind(this, srf), 30 * 1000);
        }
        else {
          this.status = 'registered';
          let expires = DEFAULT_EXPIRES;
          const contact = res.getParsedHeader('Contact');
          if (contact.length > 0 && contact[0].params && contact[0].params.expires) {
            if (contact[0].params.expires) expires = parseInt(contact[0].params.expires);
          }
          else if (res.has('Expires')) {
            expires = parseInt(res.get('Expires'));
          }
          if (isNaN(expires) || expires < 30) expires = DEFAULT_EXPIRES;
          debug(`setting timer for next register to ${expires} seconds`);
          this.timer = setTimeout(this.register.bind(this, srf), (expires - 5) * 1000);
        }
      });
    } catch (err) {
      this.logger.error({err}, `Regbot Error registering to ${this.ipv4}:${this.port}`);
      this.timer = setTimeout(this.register.bind(this, srf), 60 * 1000);
    }
  }
}

module.exports = (logger, srf) => {

  // check for new / changed carriers every 30 seconds
  setInterval(() => { getCarriers(logger, srf); }, 30000);

  // do initial setup
  getCarriers(logger, srf);

  return function() {
    debug(`status: we have ${regbots.length} regbots`);
    return {
      total: regbots.length,
      registered: regbots.reduce((acc, current) => {
        return current.status === 'registered' ? ++acc : acc;
      }, 0)
    };
  };
};

const getCarriers = async(logger, srf) => {
  const {lookupAllVoipCarriers, lookupSipGatewaysByCarrier} = srf.locals.dbHelpers;
  try {

    /* first check: has anything changed (new carriers or gateways)? */
    let hasChanged = false;
    const gws = [];
    const cs = (await lookupAllVoipCarriers())
      .filter((c) => c.requires_register);
    if (JSON.stringify(cs) !== JSON.stringify(carriers)) hasChanged = true;
    for (const c of cs) {
      try {
        const arr = (await lookupSipGatewaysByCarrier(c.voip_carrier_sid))
          .filter((gw) => gw.outbound && gw.is_active)
          .map((gw) => {
            gw.carrier = c;
            return gw;
          });
        Array.prototype.push.apply(gws, arr);
      } catch (err) {
        logger.error({err}, 'getCarriers Error retrieving gateways');
      }
    }
    if (JSON.stringify(gws) !== JSON.stringify(gateways)) hasChanged = true;

    if (hasChanged) {
      debug('getCarriers: got new or changed carriers');
      logger.info('getCarriers: got new or changed carriers');
      carriers.length = 0;
      Array.prototype.push.apply(carriers, cs);

      gateways.length = 0;
      Array.prototype.push.apply(gateways, gws);

      // stop / kill existing regbots
      regbots.forEach((rb) => rb.stop());
      regbots.length = 0;

      // start new regbots
      for (const gw of gateways) {
        const rb = new Regbot(logger, {
          ipv4: gw.ipv4,
          port: gw.port,
          username: gw.carrier.register_username,
          password: gw.carrier.register_password,
          sip_realm: gw.carrier.register_sip_realm
        });
        regbots.push(rb);
        rb.start(srf);
        logger.info({regbot: rb.toJSON()}, 'Starting regbot');
      }
      debug(`getCarriers: we have ${regbots.length} regbots`);
    }
  } catch (err) {
    logger.error({err}, 'getCarriers Error');
  }
};

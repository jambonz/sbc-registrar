const parseUri = require('drachtio-srf').parseUri;
const debug = require('debug')('jambonz:sbc-registrar');
const {NAT_EXPIRES} = require('./utils');

const initLocals = (req, res, next) => {
  req.locals = req.locals || {};
  next();
};

const rejectIpv4 = (logger) => {
  return (req, res, next) => {
    const uri = parseUri(req.uri);
    if (/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(uri.host)) {
      debug(`rejecting REGISTER from ${req.uri} as it has an ipv4 address and sip realm is required`);
      res.send(403);
      return req.srf.endSession(req);
    }
    next();
  };
};

const checkCache = (logger) => {
  return async(req, res, next) => {
    const registration = req.registration;
    const uri = parseUri(registration.aor);
    const aor = `${uri.user}@${uri.host}`;
    req.locals.realm = uri.host;

    if (registration.type === 'unregister') return next();

    const registrar = req.srf.locals.registrar;
    const result = await registrar.query(aor);
    if (result) {
      // if known valid registration coming from same address, no need to hit the reg callback hook
      if (result.proxy === `sip:${req.source_address}:${req.source_port}`) {
        debug(`responding to cached register for ${aor}`);
        res.cached = true;
        res.send(200, {
          headers: {
            'Contact': req.get('Contact').replace(/expires=\d+/, `expires=${NAT_EXPIRES}`),
            'Expires': NAT_EXPIRES
          }
        });
        return req.srf.endSession(req);
      }
    }
    next();
  };
};

const checkAccountLimits = (logger) => {
  return async(req, res, next) => {

    const {lookupAccountBySipRealm, lookupAccountCapacitiesBySid} = req.srf.locals.dbHelpers;
    const {realm} = req.locals;
    const {registrar, writeAlerts, AlertType} = req.srf.locals;
    try {
      const account = await lookupAccountBySipRealm(realm);
      if (account) {
        req.locals = {
          ...req.locals,
          account_sid: account.account_sid,
          webhook_secret: account.webhook_secret
        };
        debug(account, `checkAccountLimits: retrieved account for realm: ${realm}`);
      }
      else if (process.env.JAMBONZ_HOSTING) {
        debug(`checkAccountLimits: unknown sip realm ${realm}`);
        logger.info(`checkAccountLimits: rejecting register for unknown sip realm: ${realm}`);
        return res.send(403);
      }

      if ('unregister' === req.registration.type || !process.env.JAMBONZ_HOSTING) return next();

      /* only check limits on the jambonz hosted platform */
      const {account_sid} = account;
      const capacities = await lookupAccountCapacitiesBySid(account_sid);
      debug(JSON.stringify(capacities));
      const limit_calls = capacities.find((c) => c.category == 'voice_call_session');
      let limit_registrations = limit_calls.quantity * account.device_to_call_ratio;
      const extra = capacities.find((c) => c.category == 'device');
      if (extra && extra.quantity) limit_registrations += extra.quantity;
      debug(`call capacity: ${limit_calls.quantity}, device capacity: ${limit_registrations}`);

      if (0 === limit_registrations) {
        debug('checkAccountLimits: device calling not allowed for this account');
        logger.info({account_sid}, 'checkAccountLimits: device calling not allowed for this account');
        writeAlerts({
          alert_type: AlertType.DEVICE_LIMIT,
          account_sid,
          count: 0
        }).catch((err) => logger.info({err}, 'checkAccountLimits: error writing alert'));

        return res.send(503, 'Max Devices Registered');
      }

      const deviceCount = await registrar.getCountOfUsers(realm);
      if (deviceCount >= limit_registrations) {
        debug(account_sid, `checkAccountLimits: limit ${limit_registrations} count ${deviceCount}`);
        logger.info({account_sid}, 'checkAccountLimits: registration rejected due to limits');
        writeAlerts({
          alert_type: AlertType.DEVICE_LIMIT,
          account_sid,
          count: limit_registrations
        }).catch((err) => logger.info({err}, 'checkAccountLimits: error writing alert'));
        return res.send(503, 'Max Devices Registered');
      }
      debug(`checkAccountLimits - passed: devices registered ${deviceCount}, limit is ${limit_registrations}`);
      next();
    } catch (err) {
      logger.error({err, realm}, 'checkAccountLimits: error checking account limits');
      res.send(500);
    }
  };
};

module.exports = {
  initLocals,
  rejectIpv4,
  checkCache,
  checkAccountLimits
};

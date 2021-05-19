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

    const {lookupAccountBySipRealm} = req.srf.locals.dbHelpers;
    const {realm} = req.locals;
    try {
      const account = await lookupAccountBySipRealm(realm);
      if (account) {
        const {account_sid} = account;
        req.locals = {
          ...req.locals,
          account_sid,
          webhook_secret: account.webhook_secret
        };
        logger.debug(account, `checkAccountLimits: retrieved account for realm: ${realm}`);
      }
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

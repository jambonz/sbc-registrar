const parseUri = require('drachtio-srf').parseUri;
const debug = require('debug')('jambonz:sbc-registrar');
const {NAT_EXPIRES} = require('./utils');

function rejectIpv4(logger) {
  return (req, res, next) => {
    const uri = parseUri(req.uri);
    if (/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(uri.host)) {
      debug(`rejecting REGISTER from ${req.uri} as it has an ipv4 address and sip realm is required`);
      res.send(403);
      return req.srf.endSession(req);
    }
    next();
  };
}

function checkCache(logger) {
  return async(req, res, next) => {
    const registration = req.registration;
    if (registration.type === 'unregister') return next();
    const aor = req.registration.aor;
    const registrar = req.srf.locals.registrar;
    const result = await registrar.query(aor);
    if (result) {
      // if known valid registration coming from same address, no need to hit the reg callback hook
      if (result.proxy === `sip:${req.source_address}:${req.source_port}`) {
        debug(`responding to cached register for ${aor}`);
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
}

module.exports = {
  rejectIpv4,
  checkCache
};

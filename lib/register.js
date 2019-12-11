const {isUacBehindNat, getSipProtocol, NAT_EXPIRES} = require('./utils');

module.exports = handler;

function handler({logger}) {
  return async(req, res) => {
    logger.info(`received ${req.method} from ${req.protocol}/${req.source_address}:${req.source_port}`);
    logger.info(req.registration, 'registration details');

    if ('register' === req.registration.type && '0' !== req.registration.expires) await register(req, res);
    else await unregister(req, res);

    req.srf.endSession(req);
  };
}

async function register(req, res) {
  const registrar = req.srf.locals.registrar;
  const registration = req.registration;
  const aor = registration.aor;
  let expires = req.authorization.expires || registration.expires;
  const grantedExpires = expires;
  const contact = req.getParsedHeader('Contact')[0].uri;
  let contactHdr = req.get('Contact');
  const protocol = getSipProtocol(req);
  const proxy = `sip:${req.source_address}:${req.source_port}`;

  // reduce the registration interval if the device is behind a nat
  if (isUacBehindNat(req)) {
    //const uri = parseUri(contact);
    expires = NAT_EXPIRES;
    //contact = `sip:${uri.user}@${req.source_address}:${req.source_port}`;
    contactHdr = contactHdr.replace(/expires=\d+/, `expires=${expires}`);
  }
  const sbcAddress = req.server.hostport;
  await registrar.add(aor, {contact, sbcAddress, protocol, proxy}, grantedExpires);

  res.send(200, {
    headers: {
      'Contact': contactHdr,
      'Expires': expires
    }
  });
}

async function unregister(req, res) {
  const registrar = req.srf.locals.registrar;
  await registrar.remove(req.registration.aor);

  res.send(200, {
    headers: {
      'Contact': req.get('Contact'),
      'Expires': 0
    }
  });
}

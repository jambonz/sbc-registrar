const parseUri = require('drachtio-srf').parseUri;
const {isUacBehindNat, getSipProtocol} = require('./utils');
const NAT_EXPIRES = 30;

module.exports = handler;

function handler({logger}) {
  return (req, res) => {
    logger.info(`received ${req.method} from ${req.protocol}/${req.source_address}:${req.source_port}`);
    logger.info(req.registration, 'registration details');	
    
	try {
      if ('register' === req.registration.type) register(req, res);
      else unregister(req, res);  
    }
    catch (err) {
      logger.error(err, 'Error handling registration');
    }

    try {
      if ('0' === req.msg.headers.expires) unregister(req, res);
      else register(req, res);  
    }
    catch (err) {
      logger.error(err, 'Error handling registration');
    }
    req.srf.endSession(req);
  };
}

async function register(req, res) {
  const registrar = req.srf.locals.registrar;
  const registration = req.registration;
  const aor = registration.aor;
  let expires = registration.expires;
  let contact = req.getParsedHeader('Contact')[0].uri;
  let contactHdr = req.get('Contact');
  const protocol = getSipProtocol(req);

  // reduce the registration interval if the device is behind a nat
  if (isUacBehindNat(req)) {
    const uri = parseUri(contact);
    expires = NAT_EXPIRES;
    contact = `sip:${uri.user}@${req.source_address}:${req.source_port}`;
    contactHdr = contactHdr.replace(/expires=\d+/, `expires=${expires}`);
  }
 // aor, contact, sbcAddress, protocol, expires
  const sbcAddress = req.server.hostport;
  try {
	await registrar.add(aor, contact, sbcAddress, protocol, expires);
  } catch (err) {
	throw Error(err);
  }

  res.send(200, {
    headers: {
      'Contact': contactHdr,
      'Expires': expires
    }
  });
}

async function unregister(req, res) {
  const registrar = req.srf.locals.registrar;
  try {
	await registrar.remove(req.registration.aor);
  } catch(err) {
    throw Error(err);
  }

  res.send(200, {
    headers: {
      'Contact': req.get('Contact'),
      'Expires': 0
    }
  });
}

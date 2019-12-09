const Srf = require('drachtio-srf');
const srf = new Srf();
const config = require('config');
const logger = require('pino')(config.get('logging'));
const regParser = require('drachtio-mw-registration-parser');
const Registrar = require('jambonz-mw-registrar');
const lookupRegHook = require('./lib/db/lookup-reg-hook')(logger);
const authenticator = require('drachtio-http-authenticator')(lookupRegHook, logger);

srf.locals.registrar = new Registrar(logger, {
  host: `${config.get('redis.host')}`,
  port: `${config.get('redis.port')}`
});

// disable logging in test mode
if (process.env.NODE_ENV === 'test') {
  const noop = () => {};
  logger.info = logger.debug = noop;
  logger.child = () => {return {info: noop, error: noop, debug: noop};};
}

if (config.has('drachtio.host')) {
  srf.connect(config.get('drachtio'));
  srf.on('connect', (err, hp) => {
    if (err) throw err;
    logger.info(`connected to drachtio listening on ${hp}`);
  });
} else {
  srf.listen(config.get('drachtio'));
}

// middleware
srf.use('register', [authenticator, regParser]);

srf.register(require('./lib/register')({logger}));

module.exports = {srf};

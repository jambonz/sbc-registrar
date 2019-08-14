const Srf = require('drachtio-srf');
const srf = new Srf();const config = require('config');
const logger = require('pino')(config.get('logging'));
const regParser = require('drachtio-mw-registration-parser') ;
const {digestChallenge} = require('./lib/middleware');
const Registrar = require('./lib/registrar');
srf.locals.registrar = new Registrar(logger);

// disable logging in test mode
if (process.env.NODE_ENV === 'test') {
  const noop = () => {};
  logger.info = logger.debug = noop;
  logger.child = () => {return {info: noop, error: noop, debug: noop};};
}

srf.connect(config.get('drachtio'));
srf.on('connect', (err, hp) => {
  if (err) throw err;
  logger.info(`connected to drachtio listening on ${hp}`);
});
if (process.env.NODE_ENV !== 'test') {
  srf.on('error', (err) => logger.error(err));
}

// middleware
srf.use('register', [digestChallenge(logger), regParser]);

srf.register(require('./lib/register')({logger}));

module.exports = {srf};

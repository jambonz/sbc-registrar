const assert = require('assert');
assert.ok(process.env.JAMBONES_MYSQL_HOST &&
  process.env.JAMBONES_MYSQL_USER &&
  process.env.JAMBONES_MYSQL_PASSWORD &&
  process.env.JAMBONES_MYSQL_DATABASE, 'missing JAMBONES_MYSQL_XXX env vars');
assert.ok(process.env.JAMBONES_REDIS_HOST, 'missing JAMBONES_REDIS_HOST env var');
assert.ok(process.env.DRACHTIO_PORT || process.env.DRACHTIO_HOST, 'missing DRACHTIO_PORT env var');
assert.ok(process.env.DRACHTIO_SECRET, 'missing DRACHTIO_SECRET env var');

const Srf = require('drachtio-srf');
const srf = new Srf();
const opts = Object.assign({
  timestamp: () => {return `, "time": "${new Date().toISOString()}"`;}
}, {level: process.env.JAMBONES_LOGLEVEL || 'info'});
const logger = require('pino')(opts);
const StatsCollector = require('jambonz-stats-collector');
const stats = new StatsCollector(logger);
const regParser = require('drachtio-mw-registration-parser');
const Registrar = require('jambonz-mw-registrar');
const {rejectIpv4, checkCache} = require('./lib/middleware');
const debug = require('debug')('jambonz:sbc-registrar');


const {lookupAuthHook} = require('jambonz-db-helpers')({
  host: process.env.JAMBONES_MYSQL_HOST,
  user: process.env.JAMBONES_MYSQL_USER,
  password: process.env.JAMBONES_MYSQL_PASSWORD,
  database: process.env.JAMBONES_MYSQL_DATABASE,
  connectionLimit: process.env.JAMBONES_MYSQL_CONNECTION_LIMIT || 10
}, logger);
const authenticator = require('jambonz-http-authenticator')(lookupAuthHook, logger);
srf.locals.registrar = new Registrar(logger, {
  host: process.env.JAMBONES_REDIS_HOST,
  port: process.env.JAMBONES_REDIS_PORT || 6379
});

if (process.env.DRACHTIO_HOST) {
  srf.connect({host: process.env.DRACHTIO_HOST, port: process.env.DRACHTIO_PORT, secret: process.env.DRACHTIO_SECRET });
  srf.on('connect', (err, hp) => {
    logger.info(`connected to drachtio listening on ${hp}`);
  });
}
else {
  srf.listen({port: process.env.DRACHTIO_PORT, secret: process.env.DRACHTIO_SECRET});
}
if (process.env.NODE_ENV === 'test') {
  srf.on('error', (err) => {
    logger.info(err, 'Error connecting to drachtio');
  });
}

// middleware
srf.use('register', [rejectIpv4(logger), regParser, checkCache(logger), authenticator]);

srf.register(require('./lib/register')({logger}));

setInterval(async() => {
  const count = await srf.locals.registrar.getCountOfUsers();
  debug(`count of registered users: ${count}`);
  stats.gauge('sbc.users.count', parseInt(count));
}, 30000);


module.exports = {srf, logger};

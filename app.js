const assert = require('assert');
assert.ok(process.env.JAMBONES_MYSQL_HOST &&
  process.env.JAMBONES_MYSQL_USER &&
  process.env.JAMBONES_MYSQL_PASSWORD &&
  process.env.JAMBONES_MYSQL_DATABASE, 'missing JAMBONES_MYSQL_XXX env vars');
assert.ok(process.env.JAMBONES_REDIS_HOST, 'missing JAMBONES_REDIS_HOST env var');
assert.ok(process.env.DRACHTIO_PORT || process.env.DRACHTIO_HOST, 'missing DRACHTIO_PORT env var');
assert.ok(process.env.DRACHTIO_SECRET, 'missing DRACHTIO_SECRET env var');

const Emitter = require('events');
const Srf = require('drachtio-srf');
const srf = new Srf();
const opts = Object.assign({
  timestamp: () => {return `, "time": "${new Date().toISOString()}"`;}
}, {level: process.env.JAMBONES_LOGLEVEL || 'info'});
const logger = require('pino')(opts);
const StatsCollector = require('@jambonz/stats-collector');
const stats = new StatsCollector(logger);
const regParser = require('drachtio-mw-registration-parser');
const Registrar = require('jambonz-mw-registrar');
const {rejectIpv4, checkCache} = require('./lib/middleware');
const responseTime = require('drachtio-mw-response-time');
const debug = require('debug')('jambonz:sbc-registrar');
const {lookupAuthHook, lookupAllVoipCarriers, lookupSipGatewaysByCarrier} = require('@jambonz/db-helpers')({
  host: process.env.JAMBONES_MYSQL_HOST,
  user: process.env.JAMBONES_MYSQL_USER,
  password: process.env.JAMBONES_MYSQL_PASSWORD,
  database: process.env.JAMBONES_MYSQL_DATABASE,
  connectionLimit: process.env.JAMBONES_MYSQL_CONNECTION_LIMIT || 10
}, logger);
srf.locals.registrar = new Registrar(logger, {
  host: process.env.JAMBONES_REDIS_HOST,
  port: process.env.JAMBONES_REDIS_PORT || 6379
});
srf.locals.dbHelpers = {lookupAllVoipCarriers, lookupSipGatewaysByCarrier};

class RegOutcomeReporter extends Emitter {
  constructor() {
    super();
    this.on('regHookOutcome', ({rtt, status}) => {
      stats.histogram('app.hook.response_time', rtt, ['hook_type:auth', `status:${status}`]);
      if (![200, 403].includes(status)) stats.increment('app.hook.error.count', ['hook_type:auth', `status:${status}`]);
    });
  }
}
const authenticator = require('@jambonz/http-authenticator')(lookupAuthHook, logger, {
  emitter: new RegOutcomeReporter()
});

if (process.env.DRACHTIO_HOST) {
  srf.connect({host: process.env.DRACHTIO_HOST, port: process.env.DRACHTIO_PORT, secret: process.env.DRACHTIO_SECRET });
  srf.on('connect', (err, hp) => {
    logger.info(`connected to drachtio listening on ${hp}`);
    srf.locals.regbotStatus = require('./lib/sip-trunk-register')(logger, srf);
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

const rttMetric = (req, res, time) => {
  if (res.cached) {
    stats.histogram('sbc.registration.cached.response_time', time.toFixed(0), [`status:${res.statusCode}`]);
  }
  else {
    stats.histogram('sbc.registration.total.response_time', time.toFixed(0), [`status:${res.statusCode}`]);
  }
};

// middleware
srf.use('register', [responseTime(rttMetric), rejectIpv4(logger), regParser, checkCache(logger), authenticator]);

srf.register(require('./lib/register')({logger}));

setInterval(async() => {
  const count = await srf.locals.registrar.getCountOfUsers();
  debug(`count of registered users: ${count}`);
  stats.gauge('sbc.users.count', parseInt(count));
}, 30000);


module.exports = {srf, logger};

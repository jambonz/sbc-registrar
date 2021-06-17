require('./docker_start');
require('./create-test-db');
require('./regbot-tests');
require('./sip-tests');
if (process.env.JAMBONES_HOSTING) {
  require('./sip-tests-hosted');
}
require('./docker_stop');

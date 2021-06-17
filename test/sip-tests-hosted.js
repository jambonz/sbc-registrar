const test = require('tape');
const { output, sippUac } = require('./sipp')('test_sbc-registrar');
const debug = require('debug')('drachtio:sbc-registrar');
const clearModule = require('clear-module');

process.on('unhandledRejection', (reason, p) => {
  console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
});

function connect(connectable) {
  return new Promise((resolve, reject) => {
    connectable.on('connect', () => {
      return resolve();
    });
  });
}

test('register tests - hosted platform', (t) => {
  clearModule('../app');
  const {srf, registrar} = require('../app');

  const sippRegObj = {
    remote_host: '172.38.0.10:5060'
  };

  connect(srf)
    .then(() => {
      sippRegObj.data_file = 'good_user2.csv';
      return sippUac('uac-register-auth-failure-expect-503.xml', sippRegObj);
    })
    .then(() => {
      t.pass('registration denied if max devices already registered');
      sippRegObj.data_file = 'good_user.csv';
      return sippUac('uac-unregister-auth-success.xml', sippRegObj);
    })
    .then(() => {
      t.pass('successfully unregistered first user');
      sippRegObj.data_file = 'good_user2.csv';
      return sippUac('uac-register-auth-success2.xml', sippRegObj);
    })
    .then(() => {
      t.pass('second user can now successfully register');
      if (srf.locals.lb) srf.locals.lb.disconnect();
      srf.disconnect();
      t.end();
      return;
    })
    .catch((err) => {
      if (srf.locals.lb) srf.locals.lb.disconnect();
      if (srf) srf.disconnect();
      console.log(`error received: ${err}`);
      t.error(err);
    });
});

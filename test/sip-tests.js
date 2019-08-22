const test = require('blue-tape');
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

test('register handler', (t) => {
  clearModule('../app');
  const {srf} = require('../app');

  const sippRegObj = {
    remote_host: '172.38.0.10:5060'
  };

  connect(srf)
    .then(() => {
	  t.comment('register with bad credentials');
      sippRegObj.data_file = 'bad_password.csv';
      return sippUac('uac-register-auth-failure-expect-403.xml', sippRegObj);
    })
    .then(() => {
	  t.comment('register with good credentials');
      sippRegObj.data_file = 'good_user.csv';
      return sippUac('uac-register-auth-success.xml', sippRegObj);
    })
    .then(() => {
	  t.comment('unregister');
	  sippRegObj.data_file = 'good_user.csv';
	  return sippUac('uac-unregister-auth-success.xml', sippRegObj);
	})
    .then(() => {
      t.pass('register handler passed');
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

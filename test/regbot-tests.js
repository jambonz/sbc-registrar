const test = require('blue-tape');
const { output, sippUac } = require('./sipp')('test_sbc-registrar');
const debug = require('debug')('drachtio:sbc-registrar');
const clearModule = require('clear-module');
const exec = require('child_process').exec ;
const pwd = process.env.TRAVIS ? '' : '-p$MYSQL_ROOT_PASSWORD';

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

const wait = (duration) => {
  return new Promise((resolve) => {
    setTimeout(resolve, duration);
  });
};

test('populating more test case data', (t) => {
  exec(`mysql -h localhost -u root ${pwd} -D jambones_test < ${__dirname}/db/populate-test-data2.sql`, (err, stdout, stderr) => {
    if (err) return t.end(err);
    t.pass('test data set created');
    t.end();
  });
});

test('trunk register tests', (t) => {
  clearModule('../app');
  const {srf} = require('../app');
  t.timeoutAfter(60000);

  connect(srf)
    .then(wait.bind(null, 1500))
    .then(() => {
      const obj = srf.locals.regbotStatus();
      return t.ok(obj.total === 1 && obj.registered === 1, 'initial regbot running and successfully registered to trunk');
    })
    .then(() => {
      return new Promise((resolve, reject) => {
        exec(`mysql -h localhost -u root ${pwd} -D jambones_test < ${__dirname}/db/populate-test-data3.sql`, (err, stdout, stderr) => {
          if (err) return reject(err);
          t.pass('added new gateway');
          resolve();
        });
      });
    })
    .then(() => {
      return wait(35000);
    })
    .then(() => {
      const obj = srf.locals.regbotStatus();
      t.ok(obj.total === 2 && obj.registered === 1, 'successfully added gateway that tests failure result');
    })
    .then(() => {
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

const test = require('tape').test ;
const exec = require('child_process').exec ;

test('populating more test case data', (t) => {
  exec(`mysql -h 127.0.0.1 -u root --protocol=tcp  -D jambones_test < ${__dirname}/db/populate-test-data2.sql`, (err, stdout, stderr) => {
    if (err) return t.end(err);
    t.timeoutAfter(60000);

    setTimeout(() => {
      t.pass('test data set augmented with carriers');
      t.end();
    }, 50000)
  });
});

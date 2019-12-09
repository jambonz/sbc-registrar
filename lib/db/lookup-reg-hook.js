let lookupRegHook;

if (process.env.NODE_ENV === 'test') {
  // test stub
  lookupRegHook = function(logger) {
    return async(sipRealm) => {
      return new Promise((resolve, reject) => {
        if (sipRealm === 'fail.com') return reject('unknown sip realm');
        resolve({
          url: 'http://127.0.0.1:4000/auth',
          auth: {
            username: 'foo',
            password: 'bar'
          }
        });
      });
    };
  }

}
else {
  // prod
  const {getMysqlConnection} = require('./db');

  lookupRegHook = function(logger) {
    return async(sipRealm) => {
      return new Promise((resolve, reject) => {
        getMysqlConnection((err, conn) => {
          if (err) return reject(err);
          conn.query('SELECT * from accounts WHERE sip_realm = ?', sipRealm, (err, results, fields) => {
            conn.release();
            if (err) return reject(err);
            if (results.length === 0) return reject('unknown sip realm');
            resolve({url: results[0].registration_hook});
          });
        });
      });
    };
  };
}

module.exports = lookupRegHook;



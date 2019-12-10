let lookupRegHook;

function prepareResults(results) {
  const obj = {url: results[0].registration_hook};
  if (results[0].hook_basic_auth_user && results[0].hook_basic_auth_password) {
    Object.assign(obj, {
      auth: {
        username: results[0].hook_basic_auth_user,
        password: results[0].hook_basic_auth_password
      }
    });
  }
  return obj;
}

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
  const getMysqlConnection = require('./db');

  lookupRegHook = function(logger) {
    return async(sipRealm) => {
      return new Promise((resolve, reject) => {
        getMysqlConnection((err, conn) => {
          if (err) return reject(err);
          conn.query('SELECT * from accounts WHERE sip_realm = ?', sipRealm, (err, results) => {
            conn.release();
            if (err) return reject(err);
            if (results.length > 0 && results[0].registration_hook) {
              return resolve(prepareResults(results));
            }

            /* search for a root domain in the service_provider table */
            const arr = /([^\.]+\.[^\.]+)$/.exec(sipRealm);
            //console.log(`arr: ${JSON.stringify(arr)}`);
            if (!arr) return reject('unknown sip realm');
            const rootDomain = arr[1];
            logger.debug(`did not find hook at account level, checking service provider for ${rootDomain}`);
            getMysqlConnection((err, conn) => {
              if (err) return reject(err);
              conn.query('SELECT * from service_providers WHERE root_domain = ?', rootDomain, (err, results) => {
                conn.release();
                console.log(`results: ${JSON.stringify(results)}`);
                if (err) return reject(err);
                if (results.length > 0 && results[0].registration_hook) {
                  return resolve(prepareResults(results));
                }
                reject('unknown sip realm');
              });
            });
          });
        });
      });
    };
  };
}

module.exports = lookupRegHook;



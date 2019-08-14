const config = require('config');
const nonce = require('nonce')();
const request = require('request');
require('request-debug')(request);
const parseUri = require('drachtio-srf').parseUri;
const debug = require('debug')('jambonz');

function parseAuthHeader(hdrValue) {
  const pieces = { scheme: 'digest'} ;
  ['username', 'realm', 'nonce', 'uri', 'algorithm', 'response', 'qop', 'nc', 'cnonce', 'opaque']
    .forEach((tok) => {
      const re = new RegExp(`[,\\s]{1}${tok}="?(.+?)[",]`) ;
      const arr = re.exec(hdrValue) ;
      if (arr) {
        pieces[tok] = arr[1];
        if (pieces[tok] && pieces[tok] === '"') pieces[tok] = '';
      }
    }) ;

  pieces.algorithm = pieces.algorithm || 'MD5' ;

  // this is kind of lame...nc= (or qop=) at the end fails the regex above, should figure out how to fix that
  if (!pieces.nc && /nc=/.test(hdrValue)) {
    const arr = /nc=(.*)$/.exec(hdrValue) ;
    if (arr) {
      pieces.nc = arr[1];
    }
  }
  if (!pieces.qop && /qop=/.test(hdrValue)) {
    const arr = /qop=(.*)$/.exec(hdrValue) ;
    if (arr) {
      pieces.qop = arr[1];
    }
  }

  // check mandatory fields
  ['username', 'realm', 'nonce', 'uri', 'response'].forEach((tok) => {
    if (!pieces[tok]) throw new Error(`missing authorization component: ${tok}`);
  }) ;
  debug(`parsed header: ${JSON.stringify(pieces)}`);
  return pieces ;
}

function respondChallenge(req, res) {
  const nonceValue = nonce();
  const uri = parseUri(req.uri);
  const headers = {
    'WWW-Authenticate': `Digest realm="${uri.host}", algorithm=MD5, qop="auth", nonce="${nonceValue}"`
  };
  res.send(401, {headers});
}

function digestChallenge(logger) {

  return (req, res, next) => {
    const sipuri = parseUri(req.uri);
    if (!sipuri.host) {
      res.send(403, {
        headers: {
          'X-Reason': `detected potential spammer from ${req.source_address}:${req.source_port}`
        }
      });
    }
    if (!req.has('Authorization')) {
      return respondChallenge(req, res);
    }

    const uri = req.has('X-Auth-URL') ? req.get('X-Auth-URL') :
      (config.has('auth.uri') ? config.get('auth.uri') : null);
    const pieces = req.authorization = parseAuthHeader(req.get('Authorization'));

    request({
      uri,
      method: 'POST',
      json: true,
      body: Object.assign({method: req.method}, pieces)
    }, (err, response, body) => {
      if (err) {
        logger.error(`Error calling authentication API: ${err}`);
        return res.send(500);
      }
      if (!body || body.response !== 'ok') {
        logger.info(`Auth api returned failure: ${body}`);
        return res.send(403);
      }
      next();
    });
  };
}

module.exports = {
  digestChallenge
};
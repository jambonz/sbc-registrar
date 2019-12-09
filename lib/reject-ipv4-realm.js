const parseUri = require('drachtio-srf').parseUri;

module.exports = function(logger) {
  return (req, res, next) => {
    const uri = parseUri(req.uri);
    if (/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(uri.host)) {
      logger.debug(`rejecting REGISTER from ${req.uri} as it has an ipv4 address and sip realm is required`);
      return res.send(403);
    }
    next();
  };
};

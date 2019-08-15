const parseUri = require('drachtio-srf').parseUri;

function isUacBehindNat(req) {

  // no need for nat handling if wss or tcp being used
  if (req.protocol !== 'udp') return false;

  // let's keep it simple -- if udp, let's crank down the register interval
  return true;
}

function isWSS(req) {
  return req.getParsedHeader('Via')[0].protocol.toLowerCase().startsWith('ws');
}

module.exports = {
  isUacBehindNat,
  isWSS
};

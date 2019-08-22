const parseUri = require('drachtio-srf').parseUri;

function isUacBehindNat(req) {

  // no need for nat handling if wss or tcp being used
  if (req.protocol !== 'udp') return false;

  // let's keep it simple -- if udp, let's crank down the register interval
  return true;
}

function getSipProtocol(req) {
  if (req.getParsedHeader('Via')[0].protocol.toLowerCase().startsWith('wss')) return 'wss';
  if (req.getParsedHeader('Via')[0].protocol.toLowerCase().startsWith('ws')) return 'ws';
  if (req.getParsedHeader('Via')[0].protocol.toLowerCase().startsWith('tcp')) return 'tcp';
  if (req.getParsedHeader('Via')[0].protocol.toLowerCase().startsWith('udp')) return 'udp';
}

module.exports = {
  isUacBehindNat,
  getSipProtocol
};

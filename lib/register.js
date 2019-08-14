
module.exports = handler;

function handler({logger}) {
  return (req, res) => {
    logger.info(`received ${req.method} from ${req.protocol}/${req.source_address}:${req.source_port}`);
    logger.info(req.registration, 'registration details');
    return res.send(480, 'Under Construction!');
  };
}

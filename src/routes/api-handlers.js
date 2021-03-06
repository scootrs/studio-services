const Boom = require('@hapi/boom');
const eventstream = require('../util/eventstream');
const { createSseLogStreamForCompute } = require('../monitor/logs');

function handlePostToDeploy(request, h) {
  request.queue('requests').push({ id: request.yar.id, config: request.payload });
  return {
    message: 'Request has been queued for processing'
  };
}

function handleGetToStreamSubscribe(request, h) {
  request.logger.info('Subscription request received. Opening event stream');
  eventstream.create(request.yar.id);
  request.yar.set('isStreaming', true);
  return {
    message: 'Successfully subscribed to streaming.'
  };
}

function handleGetToStreamListen(request, h) {
  if (!request.yar.get('isStreaming')) {
    request.logger.warn('Attempt to listen without first subscribing');
    Boom.badRequest('Invalid request to listen without subscription');
  }

  // Establish our Server-Side Events channel
  request.logger.info('Listening on event stream');
  let stream = eventstream.get(request.yar.id);
  if (!stream) {
    // The session persisted but the server went down and lost the in-memory stream. Create a new one to use
    // with the same session.
    stream = eventstream.create(request.yar.id);
  }
  stream.on('close', function() {
    request.yar.set('isStreaming', false);
  });

  return h
    .response(stream)
    .code(200)
    .type('text/event-stream; charset=utf-8')
    .header('Cache-Control', 'no-cache')
    .header('Connection', 'keep-alive');
}

function handleGetToLogsForCompute(request, h) {
  const name = request.params.name;
  request.logger.info('Fetching logs for', name);

  const logs = createSseLogStreamForCompute(name);

  function killLogOnClose() {
    logs.close();
  }

  request.raw.req.on('close', killLogOnClose);
  request.raw.req.on('exit', killLogOnClose);

  return h
    .response(logs.events)
    .code(200)
    .type('text/event-stream; charset=utf-8')
    .header('Cache-Control', 'no-cache')
    .header('Connection', 'keep-alive');
}

module.exports = {
  handlePostToDeploy,
  handleGetToStreamSubscribe,
  handleGetToStreamListen,
  handleGetToLogsForCompute
};

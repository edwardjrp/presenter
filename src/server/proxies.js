var url = require('url');
var config = require('../config');
var ContentRoutingService = require('../services/content/routing');
var logger = require('./logging').logger;
var request = require('request');

function makeProxyRoute (site, path, target) {
  return function (req, res, next) {
    var host = config.presented_url_domain() || req.get('Host');
    if (host !== site) {
      return next();
    }

    var suffix = url.parse(req.originalUrl).path.replace(path, '');

    logger.debug('Proxy request: [' + target + suffix + '].');
    var proxyRequest = request(target + suffix);

    req.pipe(proxyRequest);
    proxyRequest.pipe(res);
  };
}

module.exports = function (app) {
  var proxies = ContentRoutingService.getAllProxies();

  proxies.forEach(function (each) {
    for (var path in each.proxy) {
      app.use(path + '*', makeProxyRoute(each.site, path, each.proxy[path]));
    }
  });
};

var path = require('path');
var fs = require('fs');
var walk = require('walk');

var logger = require('../../server/logging').logger;

var AtomicLoader = function (basePath, templateFiles) {
  this.templateSources = {};

  var templatePaths = Object.keys(templateFiles);

  for (var i = 0; i < templatePaths.length; i++) {
    var templateName = templatePaths[i];
    var templateSource = templateFiles[templateName];
    var templateFullPath = path.resolve(basePath, templateName);

    if (!templateFullPath.indexOf(basePath) === 0) {
      logger.warn('Attempt to load template outside of base path', {
        basePath: basePath,
        templateName: templateName,
        templatePath: templateFullPath
      });
      continue;
    }

    logger.debug('template source', {
      templateSource: templateSource
    });
    this.templateSources[templateName] = {
      src: templateSource,
      path: templateFullPath,
      noCache: this.noCache
    };
  }
};

AtomicLoader.prototype.getSource = function (name) {
  return this.templateSources[name] || null;
};

var createAtomicLoader = function (rootPath, callback) {
  if (!/\/$/.test(rootPath)) {
    rootPath += '/';
  }

  var templateFiles = {};
  var walker = walk.walk(rootPath, {followLinks: false});

  walker.on('file', function (root, stat, next) {
    var fullPath = path.join(root, stat.name);
    var templateName = fullPath.replace(rootPath, '');

    fs.readFile(fullPath, {encoding: 'utf-8'}, function (err, body) {
      if (err) {
        logger.warn('Unable to read template file', {
          templatePath: fullPath,
          errMessage: err.message,
          stack: err.stack
        });

        return next();
      }

      logger.debug('Loaded template file', {
        fullPath: fullPath,
        templateName: templateName
      });
      templateFiles[templateName] = body;
      next();
    });
  });

  walker.on('end', function () {
    callback(null, new AtomicLoader(rootPath, templateFiles));
  });
};

module.exports = createAtomicLoader;

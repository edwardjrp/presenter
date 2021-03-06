'use strict';

const fs = require('fs');
const path = require('path');
const NunjucksService = require('../nunjucks');
const PathService = require('../path');
const UrlService = require('../url');
const config = require('../../config');

var TemplateService = {
  render: function (context, options, callback) {
    let templatePath = options.templatePath;
    const templateParts = templatePath.split(path.sep).filter((part) => part.length > 0);
    let domain = context.host();
    if (templateParts.length > 0 && NunjucksService.hasEnvironment(templateParts[0])) {
      domain = templateParts[0];
      templatePath = templateParts.slice(1).join(path.sep);
    }

    var templateFile = findTemplate(domain, templatePath);
    var templateLocals = buildTemplateLocals(context, options);
    var startTs = Date.now();

    NunjucksService.getEnvironment(domain, function (err, env) {
      if (err) return callback(err);

      env.render(templateFile, templateLocals, function (err, result) {
        context.templateRenderDuration = Date.now() - startTs;

        callback(err, result);
      });
    });
  }
};

module.exports = TemplateService;

var buildTemplateLocals = function (context, options) {
  if (options.assets) {
    // Some templates still use deconst.content.assets instead of deconst.assets
    options.content.assets = options.assets;
  }

  return {
    deconst: {
      env: process.env,
      content: options.content || {},
      assets: options.assets || {},
      addenda: options.addenda || {},
      url: UrlService,
      context: context,
      request: context.request,
      response: context.response,
      isStaging: config.staging_mode()
    }
  };
};

var findTemplate = function (domain, templatePath) {
  templatePath = templatePath || 'index';

  var defaultTemplateDir = PathService.getDefaultTemplatesPath();
  var defaultTemplateBase = path.resolve(defaultTemplateDir, templatePath);

  var possibilities = [
    defaultTemplateBase,
    defaultTemplateBase + '.html',
    defaultTemplateBase + '.htm',
    defaultTemplateBase + '/index.html',
    defaultTemplateBase + '/index.htm'
  ];

  var templateDir = null;
  if (domain) {
    templateDir = PathService.getTemplatesPath(domain);
    var templateBase = path.resolve(templateDir, templatePath);

    possibilities = possibilities.concat([
      templateBase,
      templateBase + '.html',
      templateBase + '.htm',
      templateBase + '/index.html',
      templateBase + '/index.htm'
    ]);
  }

  let match = null;

  for (var i = 0; i < possibilities.length; i++) {
    let possibility = possibilities[i];
    try {
      fs.accessSync(possibility, fs.R_OK);

      // possibility is an existing path
      match = possibility;
    } catch (e) {
      // possibility does not exist or is inaccessible
    }
  }

  if (match === null && templatePath !== '404.html') {
    return findTemplate(domain, '404.html');
  }

  if (match === null) {
    throw new Error('Unable to find static 404 handler');
  }

  var m = match.replace(defaultTemplateDir + '/', '');
  if (templateDir) {
    m = m.replace(templateDir + '/', '');
  }
  return m;
};

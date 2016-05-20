'use strict';

const config = require('../../config');
const logger = require('../../server/logging').logger;
const UrlService = require('../url');
const RevisionService = require('../revision');

var contentMap = {};

const ContentRoutingService = {
  // Sentinel objects to return from getContentId
  UNMAPPED: {
    toString: function () {
      return '[unmapped]';
    }
  },
  EMPTY_ENVELOPE: {
    toString: function () {
      return '[empty]';
    }
  },

  setContentMap: function (map) {
    contentMap = map;
  },
  isKnownDomain: function (domain) {
    return contentMap[domain] !== undefined;
  },
  getContentId: function (context, urlPath) {
    urlPath = urlPath || context.presentedPath();
    var domainContentMap = getDomainContentMap(context.host());

    var found = false;
    var contentIDBase = null;
    var afterPrefix = null;
    var prefixLength = 0;

    for (var prefix in domainContentMap) {
      if (urlPath.indexOf(prefix) === 0 && prefix.length > prefixLength) {
        found = true;
        prefixLength = prefix.length;
        contentIDBase = domainContentMap[prefix];
        afterPrefix = urlPath.replace(prefix, '');
      }
    }

    if (!found) {
      return this.UNMAPPED;
    }

    if (contentIDBase === null) {
      return /^\/?$/.test(afterPrefix) ? this.EMPTY_ENVELOPE : this.UNMAPPED;
    }

    let contentID = slashJoin([contentIDBase, afterPrefix]);

    // In staging mode, prepend a path segment with the revision ID into the content ID.
    if (config.staging_mode()) {
      contentID = RevisionService.applyToContentID(context.revisionID, contentID);
    }

    return contentID;
  },
  getContentPrefix: function (context) {
    var urlPath = context.presentedPath();
    var domainContentMap = getDomainContentMap(context.host());

    var prefixMatch = null;

    for (var prefix in domainContentMap) {
      if (urlPath.indexOf(prefix) !== -1) {
        prefixMatch = prefix;
      }
    }

    return prefixMatch;
  },
  getMappingsForContentID: function (contentID, domain, onlyFirst) {
    let domainContentMaps = [];
    let revisionID = null;

    if (domain) {
      domainContentMaps = [{ domain, map: getDomainContentMap(domain) }];
    } else {
      domainContentMaps = Object.keys(contentMap).map((domain) => {
        return { domain, map: getDomainContentMap(domain) };
      });
    }

    if (config.staging_mode()) {
      let results = RevisionService.fromContentID(contentID);
      revisionID = results.revisionID;
      contentID = results.contentID;

      logger.debug('Using content ID without revision to locate presented path', {
        revisionID, contentID
      });
    }

    let mappings = [];

    // Normalize the contentID with a trailing slash so that the .indexOf() and .replace() checks
    // work correctly.
    if (!contentID.endsWith('/')) {
      contentID = contentID + '/';
    }

    domainContentMaps.forEach((domainContent) => {
      for (let basePath in domainContent.map) {
        let baseContentID = domainContent.map[basePath];
        if (baseContentID === null) continue;

        // Normalize the baseContentID with a trailing slash as well.
        if (!baseContentID.endsWith('/')) {
          baseContentID = baseContentID + '/';
        }

        if (contentID.indexOf(baseContentID) !== -1) {
          let domain = domainContent.domain;
          let subPath = '/' + contentID.replace(baseContentID, '');

          if (config.staging_mode()) {
            baseContentID = RevisionService.applyToContentID(revisionID, baseContentID);
            basePath = RevisionService.applyToPath(revisionID, domain, basePath);
          }

          let sitePath = '/' + slashJoin([basePath, subPath]);
          if (!sitePath.endsWith('/')) sitePath += '/';

          mappings.push({
            domain,
            baseContentID,
            basePath,
            path: sitePath
          });

          if (onlyFirst) break;
        }
      }
    });

    return mappings;
  },
  getPresentedUrl: function (context, contentID, crossDomain) {
    let domain = null;
    let onlyFirst = false;

    if (!crossDomain) {
      domain = context.host();
      onlyFirst = true;
    }

    let urls = this.getMappingsForContentID(contentID, domain, onlyFirst).map((mapping) => {
      return UrlService.getSiteUrl(context, mapping.path, mapping.domain);
    });

    if (urls.length === 0) return null;

    return urls[0];
  },
  getProxies: function (context) {
    return getDomainProxyMap(context.host());
  },
  getAllProxies: function () {
    var proxies = [];

    for (var site in contentMap) {
      var siteConfig = contentMap[site];
      if (siteConfig.hasOwnProperty('proxy')) {
        proxies.push({
          site: site,
          proxy: siteConfig.proxy
        });
      }
    }

    return proxies;
  }
};

module.exports = ContentRoutingService;

const getDomainContentMap = function (domain) {
  if (!contentMap.hasOwnProperty(domain) || !contentMap[domain].hasOwnProperty('content')) {
    logger.warn('Content map has no content routes defined for this domain.', {
      domain: domain
    });
    return {};
  }

  return contentMap[domain].content;
};

const getDomainProxyMap = function (domain) {
  if (!contentMap.hasOwnProperty(domain) || !contentMap[domain].hasOwnProperty('proxy')) {
    return {};
  }

  return contentMap[domain].proxy;
};

const slashJoin = function (strings) {
  return strings.map((each) => {
    return each.replace(/^\/+/, '').replace(/\/+$/, '');
  }).filter((each) => {
    return each !== '';
  }).join('/');
};

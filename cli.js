#!/usr/bin/env node

const fs = require('fs')
const request = require('request-promise')
const Promise = require('bluebird')
const opmlParse = require('node-opml-parser')
const format = require('util').format

var argv = require('yargs')
  .usage('$0 [args]')
  .option('file', {
    alias: 'f',
    demandOption: true,
    describe: 'OPML file to import',
    type: 'string'
  })
  .option('url', {
    alias: 'u',
    demandOption: true,
    describe: 'Miniflux URL',
    type: 'string'
  })
  .option('login', {
    alias: 'l',
    demandOption: true,
    describe: 'Miniflux login/username',
    type: 'string'
  })
  .option('password', {
    alias: 'p',
    demandOption: true,
    describe: 'Miniflux password',
    type: 'password'
  })
  .option('category', {
    alias: 'c',
    demandOption: true,
    describe: 'Miniflux category to import to',
    type: 'number'
  })
  .option('concurrency', {
    alias: 'n',
    demandOption: false,
    describe: 'Concurrency limit',
    default: 5,
    type: 'number'
  })
  .help()
  .argv

function error(e) {
  var error = e.error && e.error.error_message || e
  console.error(error)
  process.exit(1)
}

function out(s) {
  console.info(s)
}

function init() {
  
  var defaults = {
    feeds: {},
    category: {}
  }
  
  return Promise.resolve(defaults)
  
}

function getFeeds(ctx) {
  
  return new Promise(function(resolve, reject) {
    
    if (!fs.existsSync(argv.file)) {
      return reject(format('Invalid file %s', argv.file))
    }
    
    var opmlFile = fs.readFileSync(argv.file, 'utf-8')
    
    opmlParse(opmlFile, function(err, items) {
      if (err) {
        reject(err)
      } else {
        ctx.feeds = items
        resolve(ctx)
      }
    })
    
  })
  
}

function checkLogin(ctx) {  
  
  var options = {
    url: argv.url + '/feeds',
    method: 'GET',
    auth: {
      user: argv.login,
      pass: argv.password
    },
    json: true,
  }
  
  var returnCtx = function() {
    return ctx
  }
  
  return request(options).then(returnCtx)

}

function checkCategory(ctx) {
  
  var options = {
    url: argv.url + '/categories',
    method: 'GET',
    auth: {
      user: argv.login,
      pass: argv.password
    },
    json: true,    
  }
  
  var check = function(categories) {
    var found = categories.filter(function(category) {
      return category.id === argv.category
    })
    if (!found.length) {
      return Promise.reject(new Error(format('Invalid category ID %d', argv.category)))
    }
    ctx.category = found[0]
    return ctx;
  }
  
  return request(options).then(check)
  
}

function createFeed(item) {
  
  var options = {
    url: argv.url + '/feeds',
    method: 'POST',
    auth: {
      user: argv.login,
      pass: argv.password
    },
    body: {
      feed_url: item.feedUrl,
      category_id: argv.category,
      crawler: true
    },
    json: true,    
  }
  
  var onError = function(error) {
    var msg = error.error && error.error.error_message || error
    console.error(format('Failed to add for feed %s got error: %s', item.feedUrl, msg))
    return Promise.resolve(true)
  }
  
  var onResult = function(result) {
    console.info(format('Added feed %s', item.feedUrl))
    return Promise.resolve(true)
  }
  
  return request(options).then(onResult).catch(onError)
  
}

function createFeeds(ctx) {
  return Promise.map(ctx.feeds, createFeed, { concurrency: argv.concurrency })
}

init()
  .then(getFeeds)
  .then(checkLogin)
  .then(checkCategory)
  .then(createFeeds)
  .catch(error)

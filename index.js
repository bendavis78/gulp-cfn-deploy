/*!
 * Copyright 2016 Ben Davis
 * Released under the MIT license
 * https://github.com/bendavis78/gulp-cfn/blob/master/LICENSE
 */
'use strict';

var AWS = require('aws-sdk');
var Handlebars = require('handlebars');
var handlebars = require('gulp-compile-handlebars');
var merge = require('gulp-merge-json');
var through = require('through');
var cloudFormation = new AWS.CloudFormation();
var inq = require('inquirer');
var chalk = require('chalk');
var extend = require('util')._extend;
var path = require('path');

var theme = {
  error: chalk.red,
  warn: chalk.yellow,
  notice: chalk.cyan,
  ok: chalk.green,
  info: chalk.blue
};

function getLogger(type) {
  return function(msg) {
    msg = theme[type].bold('[%s]') + ' ' + msg;
    var params = [msg, type].concat(Array.prototype.slice.call(arguments, 1));
    var logger = type === 'warn' ? 'error' : (console[type] ? type: 'log');
    return console[logger].apply(console, params);
  };
}

var log = {};
for (var k in theme) {
  log[k] = getLogger(k);
}

function confirm(msg, cbYes, cbNo) {
  var opts = {
    type: 'confirm',
    name: 'val',
    message: msg,
    default: false
  };
  return inq.prompt([opts], function(res) {
    if (res.val) {
      cbYes(null);
    } else if (cbNo) {
      cbNo(null);
    }
  });
}

function getStack(stackName, cb) {
  cloudFormation.listStacks({}, function(err, data) {
    if (err) {
      return cb(err);
    }
    for (var i=0; i<data.StackSummaries.length; i++) {
      if (data.StackSummaries[i].StackName === stackName) {
        return cb(null, data.StackSummaries[i]);
      }
    }
    return cb();
  });
}

var defaults = {
  templateDir: 'cfn',
  buildDir: 'build/cfn',
  context: {},
  merge: {},
  handlebars: {}
};

module.exports = function(gulp, config) {
  config = extend(defaults, config);

  if (!config.stackName) {
    log.warn('stackName is missing in gulp-cfn config');
    return;
  }

  gulp.task('cfn:validate', ['cfn:build'], function() {
    return gulp.src(path.join(config.buildDir, config.stackName + '.json'))
      .pipe(through(function(file) {
        // validate resulting template
        var contents = file.contents.toString('utf8');
        cloudFormation.validateTemplate({TemplateBody: contents}, function(err) {
          if (err) {
            if (err.name === 'ValidationError') {
              log.error(err.message);
              return this.emit('error', 'CloudFormation template is invalid');
            }
          } else {
            this.emit('data', file);
          }
        }.bind(this));
      }));
  });

  gulp.task('cfn:status', function() {
    var stackName = config.stackName;
    return getStack(stackName, function(err, stack) {
      if (err) {
        throw err;
      }
      if (!stack) {
        return log.error('Stack does not exist: ' + stackName);
      }
      if (stack.StackStatus.match(/^ROLLBACK|FAILED$/)) {
        console.log(theme.error.bold(stack.StackStatus));
      } else if (stack.StackStatus.match(/IN_PROGRESS$/)) {
        console.log(theme.notice.bold(stack.StackStatus));
      } else if (stack.StackStatus.match(/COMPLETE$/)) {
        console.log(theme.ok.bold(stack.StackStatus));
      } else {
        console.log(theme.info.bold(stack.StackStatus));
      }
      log.info('Use gulp cfn:log to view full event log');
    });
  });

  gulp.task('cfn:log', function() {
    return getStack(config.stackName, function(err, stack) {
      if (err) {
        throw err;
      }
      if (!stack) {
        return log.error('Stack does not exist: ' + config.stackName);
      }
      if (!stack.StackStatus.match(/(CREATE|UPDATE)_COMPLETE/)) {
        cloudFormation.describeStackEvents({StackName: config.stackName}, function(err, data) {
          if (!data) {
            log.info('No log info available for ' + config.stackName);
            return;
          }
          var events = data.StackEvents;
          events.sort(function(a, b) {
            return new Date(a.Timestamp).getTime() - new Date(b.Timestamp).getTime();
          });
          var logTpl = Handlebars.compile(
            '{{Timestamp}} {{ResourceStatus}} [{{ResourceType}}] {{ResourceStatusReason}}');
          events.forEach(function(event) {
            event.Timestamp = new Date(event.Timestamp).toLocaleString().replace(',', '');
            var status = event.ResourceStatus;
            if (status.match(/FAILED$/)) {
              event.ResourceStatus = theme.error(status);
            } else if (status.match(/^ROLLBACK/)) {
              event.ResourceStatus = theme.warn(status);
            } else if (status.match(/CREATE_IN_PROGRESS/)) {
              event.ResourceStatus = theme.notice(status);
            } else if (status.match(/(CREATE|UPDATE)_COMPLETE$/)) {
              event.ResourceStatus = theme.ok(status);
            } else {
              event.ResourceStatus = theme.info(status);
            }
            console.log(logTpl(event));
          });
        });
      }
    });
  });

  gulp.task('cfn:resources', function() {
    return getStack(config.stackName, function(err, stack) {
      if (err) {
        throw err;
      }
      if (!stack) {
        return log.error('Stack does not exist: ' + config.stackName);
      }
      cloudFormation.listStackResources({StackName: config.stackName}, function(err, data) {
        if (!data) {
          log.info('No resources available for ' + config.stackName);
          return;
        }
        var tpl = Handlebars.compile(
          '{{LogicalResourceId}} {{ResourceStatus}} [{{ResourceType}}] {{ResourceStatusReason}}');
        var resources = data.StackResourceSummaries;
        resources.forEach(function(resource) {
          if (!resource.LogicalResourceId) {
            resource.LogicalResourceId = '(unknown)';
          }
          var status = resource.ResourceStatus;
          if (status.match(/FAILED$/)) {
            resource.ResourceStatus = theme.error(status);
          } else if (status.match(/^ROLLBACK/)) {
            resource.ResourceStatus = theme.warn(status);
          } else if (status.match(/CREATE_IN_PROGRESS/)) {
            resource.ResourceStatus = theme.notice(status);
          } else if (status.match(/(CREATE|UPDATE)_COMPLETE$/)) {
            resource.ResourceStatus = theme.ok(status);
          } else {
            resource.ResourceStatus = theme.info(status);
          }
          console.log(tpl(resource));
        });
      });
    });
  });

  gulp.task('cfn:deploy', ['cfn:validate'], function() {
    return getStack(config.stackName, function(err, stack) {
      var action, status = stack && stack.StackStatus;
      if (!status || status === 'DELETE_COMPLETE') {
        action = 'createStack';
      } else if (status.match(/(CREATE|UPDATE)_COMPLETE/)) {
        action = 'updateStack';
      } else {
        return log.error('Stack "' + config.stackName + '" is currently in ' + status + ' status and can not be deployed.');
      }

      return gulp.src(path.join(config.buildDir, config.stackName + '.json'))
        .pipe(through(function(file) {
          var templateBody = file.contents.toString('utf8');
          var templateData = JSON.parse(templateBody);
          var type, resourceTypes = [];
          for (var resource in templateData.Resources) {
            type = templateData.Resources[resource].Type;
            if (!resourceTypes.indexOf(type)) {
              resourceTypes.push(type);
            }
          }
          var params = {
            StackName: config.stackName,
            Capabilities: ['CAPABILITY_IAM'],
            TemplateBody: templateBody
          };
          cloudFormation[action](params, function(err) {
            if (err) {
              throw err;
            }
            var a = action === 'createStack' ? 'creation' : 'update';
            log.ok('Stack ' + a + ' in progress. Run gulp cfn:status to see current status.');
          });
        }));
    });
  });

  gulp.task('cfn:delete', function() {
    return getStack(config.stackName, function(err) {
      if (err) { throw err; }
      confirm('Are you sure you want to delete the stack "' + config.stackName + '"?', function() {
        cloudFormation.deleteStack({StackName: config.stackName}, function(err) {
          if (err) {
            throw err;
          }
          log.notice('Stack deletion in progress.');
        });
      });
    });
  });

  gulp.task('cfn:build', function() {
    var mergeOpts = extend({
      jsonSpace: 2, 
      fileName: config.stackName
    }, config.merge);
    return gulp.src(path.join(config.templateDir, '**/*.json'))
      .pipe(handlebars(config.context, config.handlebars))
      .pipe(merge(mergeOpts))
      .pipe(gulp.dest(config.buildDir))
      .on('error', function(error) {
        log.error(error);
        if (error.stack) {
          console.error(error.stack);
        }
      });
  });
};

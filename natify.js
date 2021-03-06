var fs = require('graceful-fs')
	, exec = require('child_process').exec
	, log = require('npmlog')
	, xml2js = require('xml2js')

function logCommand (cwd, command) {
	log.info('in `' + cwd + '`\n\trunning `' + command + '`')
}

function done (cb) {
	return function (error, stdout, stderr) {
		console.log(stdout)
		console.log(stderr)
		cb(error)
	}
}

module.exports = exports = {
	isCreated: function (cwd, cordovaDirectoryName, cb) {
		var dir = cwd + '/' + cordovaDirectoryName
		fs.exists(dir, function (exists) {
      if (exists) {
      	cb()
      } else {
      	cb(null, 'pleaseCreate')
      }
    })
	}
	, create: function (cwd, cordovaDirectoryName, rdsid, displayName, cb) {
		var command = 'cordova create '
			+ cordovaDirectoryName
			+ ' '
			+ rdsid
			+ ' '
			+ cordovaDirectoryName
		logCommand(cwd, command)
		exec(command
			, { cwd: cwd }
			, done(function (err) {
				// var dir = cwd + '/' + cordovaDirectoryName
				if (err) {
					cb(err)
				} else {
					var command = 'cordova plugin add '
						+ 'https://github.com/apache/cordova-plugins.git#master:keyboard'
					console.log('Skipping `' + command + '` (see https://issues.apache.org/jira/browse/CB-3020?focusedCommentId=14094596&page=com.atlassian.jira.plugin.system.issuetabpanels:comment-tabpanel#comment-14094596)')
					cb(null)
				// 	logCommand(dir, command)
				// 	exec(command
				// 		, { cwd: dir }
				// 		, done(cb))
				}
			}))
	}
	, getConfig: function (cwd, cordovaDirectoryName, cb) {
		var file = cwd + '/' + cordovaDirectoryName + '/config.xml'
		fs.readFile(file, 'utf8', function (err, fileContents) {
			var parsedConfig
			if (err) {
				cb(err)
			} else {
				parsedConfig = xml2js.parseString(fileContents
					, { trim: true }
					, function (err, result) {
						if (err) {
							cb(err)
						} else {
							parsedConfig = result.widget
							cb(null, {
								rdsid: parsedConfig.$.id
								, name: parsedConfig.name[0]
								, description: parsedConfig.description[0]
								, authorEmail: parsedConfig.author[0].$.email
								, authorHref: parsedConfig.author[0].$.href
								, authorText: parsedConfig.author[0]._
							})
						}
					})
			}
		})
	}
	, saveConfig: function (cwd, cordovaDirectoryName, data, cb) {
		var file = cwd + '/' + cordovaDirectoryName + '/config.xml'
		fs.readFile(file, 'utf8', function (err, fileContents) {
			var parsedConfig
			if (err) {
				cb(err)
			} else {
				parsedConfig = xml2js.parseString(fileContents, function (err, result) {
					var parsedData
						, xml
					if (err) {
						cb(err)
					} else {
						parsedData = JSON.parse(data)

						result.widget.$.id = parsedData.rdsid
						result.widget.name[0] = parsedData.name
						result.widget.description[0] = parsedData.description
						result.widget.author[0].$.email = parsedData.authorEmail
						result.widget.author[0].$.href = parsedData.authorHref
						result.widget.author[0]._ = parsedData.authorText

						// TODO Make different versions and send to different places (merges/:platform/config.xml)
						// OR, if cordova doesn't use this properly, do nothing more here, but add extras when running (make platform-specific config.xml, build for that platform, replace original config.xml, repeat for other platforms, run all, something horrible like that)
						result.widget.preference = [
							{ $: { name: "HideKeyboardFormAccessoryBar", value: "true" } }	// TODO Get this to work or confirm it is indefinately broken
							, { $: { name: "KeyboardShrinksView", value: "true" } }	// TODO Test that this actually does something
							, { $: { name: "AllowInlineMediaPlayback", value: "true" } }	// TODO Confirm I can remove
							, { $: { name: "MediaPlaybackRequiresUserGesture", value: "false" } }	// TODO Confirm I can remove
							, { $: { name: "AndroidPersistentFileLocation", value: "Internal" } }	// TODO Choose proper value
							, { $: { name: "iosPersistentFileLocation", value: "Library" } }	// TODO Choose proper value
						]


						xml = new xml2js.Builder()
						fs.writeFile(file, xml.buildObject(result), 'utf8', function (err) {
							if (err) {
								cb(err)
							} else {
								cb(null)
							}
						})
					}
				})
			}
		})
	}
	, getPlatforms: function (cwd, cordovaDirectoryName, cb) {
		var dir = cwd + '/' + cordovaDirectoryName
			, command = 'cordova platforms list'
		logCommand(dir, command)
		exec(command
			, { cwd: dir }
			, function (error, stdout, stderr) {
				var platforms
					, installed
					, available
					, l
					, i
				if (error) {
					console.log(stderr)
					cb(error)
				} else {
					platforms = stdout.split('\n')
					installed = platforms[0]
						.slice("Installed platforms: ".length)
						.split(', ')
					available = platforms[1]
						.slice("Available platforms: ".length)
						.split(', ')
					l = installed.length
					for (i = 0; i < l; i += 1) {
						installed[i] = installed[i].split(' ')[0]
					}
					cb(null, {
						installed: installed
						, available: available
					})
				}
			})
	}
	, preparePlatforms: function (cwd, cordovaDirectoryName, selectedPlatforms, flag, cb) {
		exports.getPlatforms(cwd, cordovaDirectoryName, function (error, data) {
			var l
				, i
				, needAdding
				, finish = function () {
					exports.getTargets(cwd, cordovaDirectoryName, selectedPlatforms, flag, cb)
				}
			if (error) {
        cb(error)
      } else {
      	l = selectedPlatforms.length
      	needAdding = []
      	for (i = 0; i < l; i += 1) {
      		if (!(~data.installed.indexOf(selectedPlatforms[i]))) {
      			needAdding.push(selectedPlatforms[i])
      		}
      	}
        if (needAdding.length > 0) {
        	exports.installPlatforms(cwd, cordovaDirectoryName, needAdding, function (error) {
        		if (error) {
        			cb(error)
        		} else {
        			finish()
        		}
        	})
        } else {
        	finish()
        }
      }
		})
	}
	, installPlatforms: function (cwd, cordovaDirectoryName, selectedPlatforms, cb) {
		var s = selectedPlatforms
			, dir = cwd + '/' + cordovaDirectoryName
			, command = 'cordova platform add ' + s.join(' ')
		logCommand(dir, command)
		exec(command
			, { cwd: dir }
			, done(cb))
	}
	, getTargets: function (cwd, cordovaDirectoryName, selectedPlatforms, flag, cb) {
		var allTargets = {}
			, l = selectedPlatforms.length
			, nbLeft = l
			, i
		for (i = 0; i < l; i += 1) {
			allTargets[selectedPlatforms[i]] = exports.getPlatformTargets(cwd
				, cordovaDirectoryName
				, selectedPlatforms[i]
				, flag
				, (function (platform) {
					return function (error, targets) {
						if (error) {
							cb(error)
						} else {
							allTargets[platform] = targets
							nbLeft -= 1
							if (nbLeft === 0) {
								cb(null, allTargets)
							}
						}
					}
				}(selectedPlatforms[i])))
		}
	}
	, getPlatformTargets: function (cwd, cordovaDirectoryName, platform, flag, cb) {
		var dir = cwd + '/' + cordovaDirectoryName
			, command = './platforms/'
				+ platform
				+ '/cordova/lib/'
				+ ((flag === '--emulator') ? 'list-emulator-images' : 'list-devices')
				+ ((platform === 'wp8' || platform === 'windows8') ? '.bat' : '')
			, r
		logCommand(dir, command)
		exec(command
			, { cwd: dir }
			, function (error, stdout, stderr) {
				var l
					, i
					, currentTarget
				if (error) {
					console.log(stderr)
					cb(error)
				} else {
					targetArray = stdout
						.slice(0, -1)
						.split('\n')
						.map(function (value, index, arr) {
							return value.replace(/"/g, '')
						}).filter(function (value) {
							return value !== ''
						})
					cb(null, targetArray)            
				}
			})
	}
	, populate: function (cwd, cordovaDirectoryName, cb) {
		var command = 'rsync -r * '
			+ cordovaDirectoryName + '/www'
			+ ' --exclude '
			+ cordovaDirectoryName
		logCommand(cwd, command)
		exec(command
			, { cwd: cwd }
			, done(cb))
	}
	, run: function (cwd, cordovaDirectoryName, targets, action, cb) {
		exports.populate(cwd, cordovaDirectoryName, function (error) {
			var dir
				, command
				, flag = (action === 'emulate') ? '--emulator' : '--device'
				, usableTarget
				, l
				, i
				, nbLeft
			if (error) {
				cb(error)
			} else {
				dir = cwd + '/' + cordovaDirectoryName
				l = targets.length
				nbLeft = l
				for (i = 0; i < l; i += 1) {
					usableTarget = (~targets[i].target.indexOf(' ')) ? '"' + targets[i].target + '"' : targets[i].target
					command = 'cordova run '
						+ targets[i].platform
						+ ' '
						+ flag
						+ ' '
						+ '--target=' + usableTarget
					logCommand(dir, command)
					exec(command
						, { cwd: dir }
						, done(function (error) {
							if (error) {
								cb(error)
							} else {
								nbLeft -= 1
								if (nbLeft === 0) {
									cb()
								}
							}
						}))
				}
			}
		})
	}
}
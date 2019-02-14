const express = require('express');
const app = express();
const https = require('https');
const http = require('http');
const program = require('commander');

const DEFAULT_PORT = 3000;
const DEFAULT_BIND = '127.0.0.1';
const DEFAULT_REGISTRY = 'http://localhost:5984';
const DEFAULT_FALLBACK_REGISTRY = 'https://registry.npmjs.org';

program.version(require('./package.json').version, '-v', '--version')
.usage('[options]')
.option('--port <port>', `Sets the port. Defaults to ${DEFAULT_PORT}`, parseInt)
.option('--bind <ip>', `Sets the binding IP. Defaults to ${DEFAULT_BIND}`)
.option('--registry <hostname>', `Sets the registry hostname. Defaults to ${DEFAULT_REGISTRY}`)
.option('--fallback <hostname>', `Sets the fallback registry hostname. Defaults to ${DEFAULT_FALLBACK_REGISTRY}`)
.parse(process.argv);

var port = program.port || DEFAULT_PORT;
var bind = program.bind || DEFAULT_BIND;
var registry = program.registry || DEFAULT_REGISTRY;
var fallback = program.fallback || DEFAULT_FALLBACK_REGISTRY

const forbiddenFallbacks = [
	/\/\-\/v+[0-9]+\/login/,
	/\/\-+\/user\//
];

const forbiddenFallbackMethods = [
	'PUT',
	'DELETE'
];

app.all('*', (req, res) => {
	var headers = req.headers;
	var url = req.url;
	var method = req.method;

	var forceForbideFallback = false;

	if (forbiddenFallbackMethods.indexOf(method.toUpperCase()) > -1) {
		forceForbideFallback = true;
		console.log('FORCE FORBIDE FALLBACK: TRUE');
	}

	var inData = '';
	req.on('data', (chunk) => {
		inData += chunk;
	});

	req.on('end', () => {
		forwardTo(registry, method, url, headers, inData).then((response) => {
			if (response.status >= 200 && response.status < 400) {
				res.write(response.data);
				res.end();
			}
			else {
				if (!forceForbideFallback && canFallback(url)) {
					console.log('Using fallback registry');
					forwardTo(fallback, method, url, headers, inData).then((response) => {
						res.status(response.status);
						res.write(response.data);
						res.end();
					});
				}
				else {
					console.log('This URL is forbidden to fallback');
					res.status(response.status);
					res.write(response.data);
					console.log(response.data);
					res.end();
				}
			}
		});
	});
});

var canFallback = (url) => {
	for (var i = 0; i < forbiddenFallbacks.length; i++) {
		var re = forbiddenFallbacks[i];
		if (re.test(url)) {
			return false;
		}
	}
	return true;
}

var forwardTo = (base, method, url, headers, inData) => {
	return new Promise((resolve, reject) => {
		var isFallback = base === fallback;
		var agent = base.indexOf('https:') > -1 ? https : http;
		
		var opts = {
			headers : headers,
			method: method
		};

		delete opts.headers.host;

		if (isFallback) {
			url = url.replace('/registry/_design/app/_rewrite', '');
			console.log('Redirecting Request', url);
		}
		else {
			console.log('Incoming Request', url);
		}

		var mainReq = agent.request(new URL(url, base), opts, (res) => {
			var data = '';

			res.setEncoding('utf8');

			res.on('data', (chunk) => {
				data += chunk;
			});

			res.on('end', () => {
				resolve({
					status: res.statusCode,
					data : data
				});
			});
		});

		mainReq.write(inData);
		mainReq.end();
	});
};

app.listen(port);

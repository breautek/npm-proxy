const express = require('express');
const app = express();
const https = require('https');
const http = require('http');
const port = 3000;

// const MAIN_SERVER = 'http://localhost:5984';
// const FALLBACK = 'https://registry.npmjs.org/';

const MAIN_SERVER = {
	hostname : 'http://localhost:5984',
	port: 5984,
	protocol: 'http:'
}

const FALLBACK = {
	hostname: 'https://registry.npmjs.org',
	port: 443,
	protocol: 'https:'
}

app.all('*', (req, res) => {
	// console.log(req);
	var headers = req.headers;
	var url = req.url;
	var method = req.method;

	// console.log(req);

	var inData = '';
	req.on('data', (chunk) => {
		inData += chunk;
	});

	req.on('end', () => {
		forwardTo(MAIN_SERVER, method, url, headers, inData).then((response) => {
			// console.log(response, 'response');
			if (response.status >= 200 && response.status < 400) {
				res.write(response.data);
				res.end();
			}
			else {
				if (canFallback(url)) {
					forwardTo(FALLBACK, method, url, headers, inData, true).then((response) => {
						// console.log(response);
						res.status(response.status);
						res.write(response.data);
						res.end();
					});
				}
				else {
					res.status(response.status);
					res.write(response.data);
					res.end();
				}
			}
		});
	});
});

var canFallback = (url) => {
	console.log(url);
	if (url.indexOf('/login') > -1) {
		return false;
	}
	if (url.indexOf('user') > -1) {
		return false;
	}
	return true;
}

var forwardTo = (base, method, url, headers, inData, isFallback) => {
	return new Promise((resolve, reject) => {
		// var opts = {
		// 	hostname: base.hostname,
		// 	port : base.port,
		// 	method: method,
		// 	path: url,
		// 	headers: headers,
		// };

		var agent = base.port === 443 ? https : http;
		// var agent = http;
		
		var opts = {
			headers : headers
		};
		// console.log('headers', opts.headers);
		delete opts.headers.host;

		// console.log(new URL(url, base.hostname));
		if (isFallback) {

			url = url.replace('/registry/_design/app/_rewrite', '');
			// console.log(new URL(url, base.hostname));
			// process.exit();
		}

		var mainReq = agent.request(new URL(url, base.hostname), opts, (res) => {
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

		// console.log(`Sending ${base.hostname}: ${inData}`);

		mainReq.write(inData);
		mainReq.end();
	});
};

app.listen(port);

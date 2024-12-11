const { execSync } = require('child_process');

class S3Cleaner {
	constructor(serverless) {
		this.serverless = serverless;
		this.hooks = {
			'before:remove:remove': this.cleanBucket.bind(this),
		};
	}

	cleanBucket() {
		const serviceName = this.serverless.service.service;
		const stage = this.serverless.service.provider.stage;
		const bucketName = `${serviceName}-${stage}-images`;

		console.log(`Emptying S3 bucket: ${bucketName}`);
		execSync(`aws s3 rm s3://${bucketName} --recursive`, { stdio: 'inherit' });
	}
}

module.exports = S3Cleaner;

#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { VpcStack } from '../lib/vpc_stack-stack';

const app = new cdk.App();
new VpcStack(app, 'VpcStack', {
  // env: {
  //   account: "585434595970",
  //   region: "us-east-1"
  // }
});
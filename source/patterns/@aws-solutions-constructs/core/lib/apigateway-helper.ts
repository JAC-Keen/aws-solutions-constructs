/**
 *  Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

 // Imports
import * as logs from '@aws-cdk/aws-logs';
import * as lambda from '@aws-cdk/aws-lambda';
import * as cdk from '@aws-cdk/core';
import * as api from '@aws-cdk/aws-apigateway';
import * as iam from '@aws-cdk/aws-iam';
import * as apiDefaults from './apigateway-defaults';
import { DefaultLogGroupProps } from './cloudwatch-log-group-defaults';
import { overrideProps } from './utils';

/**
 * Create and configures access logging for API Gateway resources.
 * @param scope - the construct to which the access logging capabilities should be attached to.
 * @param _api - an existing api.RestApi or api.LambdaRestApi.
 */
function configureCloudwatchRoleForApi(scope: cdk.Construct, _api: api.RestApi): void {
    // Setup the IAM Role for API Gateway CloudWatch access
    const restApiCloudwatchRole = new iam.Role(scope, 'LambdaRestApiCloudWatchRole', {
        assumedBy: new iam.ServicePrincipal('apigateway.amazonaws.com'),
        inlinePolicies: {
            LambdaRestApiCloudWatchRolePolicy: new iam.PolicyDocument({
                statements: [new iam.PolicyStatement({
                    actions: [
                        'logs:CreateLogGroup',
                        'logs:CreateLogStream',
                        'logs:DescribeLogGroups',
                        'logs:DescribeLogStreams',
                        'logs:PutLogEvents',
                        'logs:GetLogEvents',
                        'logs:FilterLogEvents'
                    ],
                    resources: [`arn:aws:logs:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:*`]
                })]
            })
        }
    });
    // Create and configure AWS::ApiGateway::Account with CloudWatch Role for ApiGateway
    const CfnApi = _api.node.findChild('Resource') as api.CfnRestApi;
    const cfnAccount: api.CfnAccount = new api.CfnAccount(scope, 'LambdaRestApiAccount', {
        cloudWatchRoleArn: restApiCloudwatchRole.roleArn
    });
    cfnAccount.addDependsOn(CfnApi);

    // Suppress Cfn Nag warning for APIG
    const deployment: api.CfnDeployment = _api.latestDeployment?.node.findChild('Resource') as api.CfnDeployment;
    deployment.cfnOptions.metadata = {
        cfn_nag: {
            rules_to_suppress: [{
                id: 'W45',
                reason: `ApiGateway has AccessLogging enabled in AWS::ApiGateway::Stage resource, but cfn_nag checkes for it in AWS::ApiGateway::Deployment resource`
            }]
        }
    };
}

/**
 * Creates and configures an api.LambdaRestApi.
 * @param scope - the construct to which the LambdaRestApi should be attached to.
 * @param defaultApiGatewayProps - the default properties for the LambdaRestApi.
 * @param apiGatewayProps - (optional) user-specified properties to override the default properties.
 */
function configureLambdaRestApi(scope: cdk.Construct, defaultApiGatewayProps: api.LambdaRestApiProps,
                                apiGatewayProps?: api.LambdaRestApiProps): api.RestApi {
    // Define the API object
    let _api: api.RestApi;
    if (apiGatewayProps) {
        // If property overrides have been provided, incorporate them and deploy
        const _apiGatewayProps = overrideProps(defaultApiGatewayProps, apiGatewayProps);
        _api = new api.LambdaRestApi(scope, 'LambdaRestApi', _apiGatewayProps);
    } else {
        // If no property overrides, deploy using the default configuration
        _api = new api.LambdaRestApi(scope, 'LambdaRestApi', defaultApiGatewayProps);
    }
    // Configure API access logging
    configureCloudwatchRoleForApi(scope, _api);

    // Configure Usage Plan
    _api.addUsagePlan('UsagePlan', {
        apiStages: [{
          api: _api,
          stage: _api.deploymentStage
        }]
    });

    // Return the API object
    return _api;
}

/**
 * Creates and configures an api.RestApi.
 * @param scope - the construct to which the RestApi should be attached to.
 * @param defaultApiGatewayProps - the default properties for the RestApi.
 * @param apiGatewayProps - (optional) user-specified properties to override the default properties.
 */
function configureRestApi(scope: cdk.Construct, defaultApiGatewayProps: api.RestApiProps,
                          apiGatewayProps?: api.RestApiProps): api.RestApi {
    // Define the API
    let _api: api.RestApi;
    if (apiGatewayProps) {
        // If property overrides have been provided, incorporate them and deploy
        const _apiGatewayProps = overrideProps(defaultApiGatewayProps, apiGatewayProps);
        _api = new api.RestApi(scope, 'RestApi', _apiGatewayProps);
    } else {
        // If no property overrides, deploy using the default configuration
        _api = new api.RestApi(scope, 'RestApi', defaultApiGatewayProps);
    }
    // Configure API access logging
    configureCloudwatchRoleForApi(scope, _api);

    // Configure Usage Plan
    _api.addUsagePlan('UsagePlan', {
        apiStages: [{
          api: _api,
          stage: _api.deploymentStage
        }]
    });

    // Return the API
    return _api;
}

/**
 * Builds and returns a global api.RestApi designed to be used with an AWS Lambda function.
 * @param scope - the construct to which the RestApi should be attached to.
 * @param _existingLambdaObj - an existing AWS Lambda function.
 * @param apiGatewayProps - (optional) user-specified properties to override the default properties.
 */
export function GlobalLambdaRestApi(scope: cdk.Construct, _existingLambdaObj: lambda.Function,
                                    apiGatewayProps?: api.LambdaRestApiProps): api.RestApi {

    // Configure log group for API Gateway AccessLogging
    const logGroup = new logs.LogGroup(scope, 'ApiAccessLogGroup', DefaultLogGroupProps());

    const defaultProps = apiDefaults.DefaultGlobalLambdaRestApiProps(_existingLambdaObj, logGroup);
    return configureLambdaRestApi(scope, defaultProps, apiGatewayProps);
}

/**
 * Builds and returns a regional api.RestApi designed to be used with an AWS Lambda function.
 * @param scope - the construct to which the RestApi should be attached to.
 * @param _existingLambdaObj - an existing AWS Lambda function.
 * @param apiGatewayProps - (optional) user-specified properties to override the default properties.
 */
export function RegionalLambdaRestApi(scope: cdk.Construct, _existingLambdaObj: lambda.Function,
                                      apiGatewayProps?: api.LambdaRestApiProps): api.RestApi {
    // Configure log group for API Gateway AccessLogging
    const logGroup = new logs.LogGroup(scope, 'ApiAccessLogGroup', DefaultLogGroupProps());

    const defaultProps = apiDefaults.DefaultRegionalLambdaRestApiProps(_existingLambdaObj, logGroup);
    return configureLambdaRestApi(scope, defaultProps, apiGatewayProps);
}

/**
 * Builds and returns a standard api.RestApi.
 * @param scope - the construct to which the RestApi should be attached to.
 * @param apiGatewayProps - (optional) user-specified properties to override the default properties.
 */
export function GlobalRestApi(scope: cdk.Construct, apiGatewayProps?: api.RestApiProps): api.RestApi {
    // Configure log group for API Gateway AccessLogging
    const logGroup = new logs.LogGroup(scope, 'ApiAccessLogGroup', DefaultLogGroupProps());

    const defaultProps = apiDefaults.DefaultGlobalRestApiProps(logGroup);
    return configureRestApi(scope, defaultProps, apiGatewayProps);
}
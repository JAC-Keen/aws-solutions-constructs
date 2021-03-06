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

import * as sfn from '@aws-cdk/aws-stepfunctions';
import * as events from '@aws-cdk/aws-events';
import * as defaults from '@aws-solutions-constructs/core';
import * as iam from '@aws-cdk/aws-iam';
import { Construct } from '@aws-cdk/core';
import { overrideProps } from '@aws-solutions-constructs/core';
import * as cloudwatch from '@aws-cdk/aws-cloudwatch';

/**
 * @summary The properties for the EventsRuleToStepFunction Construct
 */
export interface EventsRuleToStepFunctionProps {
  /**
   * User provided StateMachineProps to override the defaults
   *
   * @default - None
   */
  readonly stateMachineProps: sfn.StateMachineProps,
  /**
   * User provided eventRuleProps to override the defaults
   *
   * @default - None
   */
  readonly eventRuleProps: events.RuleProps
}

export class EventsRuleToStepFunction extends Construct {
  public readonly stateMachine: sfn.StateMachine;
  public readonly eventsRule: events.Rule;
  public readonly cloudwatchAlarms: cloudwatch.Alarm[];

  /**
   * @summary Constructs a new instance of the EventsRuleToStepFunction class.
   * @param {cdk.App} scope - represents the scope for all the resources.
   * @param {string} id - this is a a scope-unique id.
   * @param {EventsRuleToStepFunctionProps} props - user provided props for the construct
   * @since 0.9.0
   * @access public
   */
  constructor(scope: Construct, id: string, props: EventsRuleToStepFunctionProps) {
    super(scope, id);

    this.stateMachine = defaults.buildStateMachine(this, props.stateMachineProps);

    // Create an IAM role for Events to start the State Machine
    const eventsRole = new iam.Role(this, 'EventsRuleRole', {
      assumedBy: new iam.ServicePrincipal('events.amazonaws.com')
    });

    // Grant the start execution permission to the Events service
    this.stateMachine.grantStartExecution(eventsRole);

    // Setup the Events target
    const stateMachine: events.IRuleTarget = {
      bind: () => ({
        id: '',
        arn: this.stateMachine.stateMachineArn,
        role: eventsRole
      })
    };

    // Defaults props for the Events
    const defaultEventsRuleProps = defaults.DefaultEventsRuleProps([stateMachine]);
    // Override the defaults with the user provided props
    const eventsRuleProps = overrideProps(defaultEventsRuleProps, props.eventRuleProps, true);
    // Create the Events Rule for the State Machine
    this.eventsRule = new events.Rule(this, 'EventsRule', eventsRuleProps);
    // Deploy best practices CW Alarms for State Machine
    this.cloudwatchAlarms = defaults.buildStepFunctionCWAlarms(this, this.stateMachine);
  }
}
const { Stack } = require('aws-cdk-lib');
const ec2 = require('aws-cdk-lib/aws-ec2');
const ecr = require('aws-cdk-lib/aws-ecr');
const ecs = require('aws-cdk-lib/aws-ecs');
const elb = require('aws-cdk-lib/aws-elasticloadbalancingv2');
const cb  = require('aws-cdk-lib/aws-codebuild');
const cp  = require('aws-cdk-lib/aws-codepipeline');
const cd  = require('aws-cdk-lib/aws-codedeploy');
const cp_actions = require('aws-cdk-lib/aws-codepipeline-actions');

class ReflexiveInfrastructureStack extends Stack {
  constructor(scope, id, props) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, 'ReflexiveVpc', {
      vpcName: 'Reflexivevpc'
    });

    const cluster = new ecs.Cluster(this, 'ReflexiveCluster', {
      vpc,
      enableFargateCapacityProviders: true
    });

    const repo = new ecr.Repository(this, 'ReflexiveJs_Reop');

    const taskDef = new ecs.FargateTaskDefinition(this, 'ReflexiveTaskDef', {
      memoryLimitMiB: 1024,
      cpu: 512
    });

    const container = taskDef.addContainer('ReflexiveContainer', {
      image: ecs.ContainerImage.fromEcrRepository(repo)
    });

    container.addPortMappings({
      containerPort: 3000,
      hostPort: 3000
    });

    const service = new ecs.FargateService(this, 'ReflexiveSetvice', {
      cluster: cluster,
      taskDefinition: taskDef
    });

    const nlb = new elb.NetworkLoadBalancer(this, 'ReflexiveNlb', {
      vpc,
      internetFacing: true
    });

    const listener = nlb.addListener('ReflexiveNlbListener', {
      port: 3000,
      protocol: elb.Protocol.TCP
    });

    listener.addTargets('ReflexiveNlbTarget', {
      port: 3000,
      protocol: elb.Protocol.TCP,
      targets: [service.loadBalancerTarget({
        containerName: 'ReflexiveContainer',
        containerPort: 3000
      })]
    });

    const pipeline = new cp.Pipeline(this, 'ReflexivePipelie', {
      pipelineName: 'ReflexivePipeline'
    });

    const sourceOutput = new cp.Artifact('source');
    const sourceAction = new cp_actions.CodeStarConnectionsSourceAction({
      actionName: 'Github_Source',
      connectionArn: 'arn:aws:codestar-connections:eu-west-1:884307244203:connection/e92bbf4c-8ef8-48a3-8ecd-e3c8391494e1',
      owner: 'ntalbs',
      repo: 'reflexive-js',
      output: sourceOutput,
      branch: 'main',
      triggerOnPush: true
    });

    const sourceStage = pipeline.addStage({
      stageName: 'Source',
      actions: [sourceAction]
    });


    const awsAccount = process.env.CDK_DEFAULT_ACCOUNT;
    const awsRegion = process.env.CDK_DEFAULT_REGION;
    const ecr_uri = `${awsAccount}.dkr.ecr.${awsRegion}.amazonaws.com/ReflexiveJsRepo`;

    const project = new cb.Project(this, 'ReflexiveProject', {
      environment: {
        buildImage: cb.LinuxBuildImage.STANDARD_5_0
      },
      buildSpec: cb.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          pre_build: {
            commands: [
              `aws ecr get-login-password --region ${awsRegion} | docker login --username AWS --password-stdin ${ecr_uri}`
            ]
          },
          build: {
            commands: [
              'docker build -t reflexive-js .',
              `docker tag reflexive-js ${ecr_uri}`
            ]
          },
          post_build: {
            commands: [
              `docker push ${ecr_uri}`,
              `printf '[{"name": "ReflexiveTaskDef", "imageUri": "%s"}]' ${ecr_uri} > imagedefinitions.json`
            ]
          }
        },
        artifacts: {
          files: [
            'imagedefinitions.json'
          ]
        }
      })
    });

    const buildOutput = new cp.Artifact('build');
    const buildAction = new cp_actions.CodeBuildAction({
      actionName: 'BuildAction',
      input: sourceOutput,
      outputs: [buildOutput],
      project: project
    });

    const buildStage = pipeline.addStage({
      stageName: 'Build',
      actions: [buildAction]
    });

    const application = new cd.EcsApplication(this, 'ReflexiveApp', {
      applicationName: 'ReflexiveApp'
    });

    const deploymentGroup  = new cd.EcsDeploymentGroup(this, 'ReflexiveDeploymentGroup', {
      application,
      deploymentGroupName: 'ReflexiveDeploymentGroup',
      installAgent: true,
      ignorePollAlarmsFailure: false,
      autoRollback: {
        failedDeployment: true,
        stoppedDeployment: true,
        deploymentInAlarm: false,
      },
    })

    const deployAction = new cp_actions.CodeDeployServerDeployAction({
      actionName: 'DeployAction',
      deploymentGroup: deploymentGroup,
      input: buildOutput
    })

    const deployStage = pipeline.addStage({
      stageName: 'Deploy',
      actions: [deployAction]
    })
  }
}

module.exports = { ReflexiveInfrastructureStack }

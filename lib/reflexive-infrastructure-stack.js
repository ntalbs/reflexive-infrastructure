const { Stack } = require('aws-cdk-lib');
const ec2 = require('aws-cdk-lib/aws-ec2');
const ecr = require('aws-cdk-lib/aws-ecr');
const ecs = require('aws-cdk-lib/aws-ecs');
const elb = require('aws-cdk-lib/aws-elasticloadbalancingv2');

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
  }
}

module.exports = { ReflexiveInfrastructureStack }

gulp-cfn-deploy
========

[CloudFormation](https://aws.amazon.com/cloudformation/) is an AWS service that
allows you to create and manage a collection of AWS resources, provisioning and
updating them in an orderly and predictable fashion.

With CloudFormation, you can create a "stack" that contain all of the resources
necessary for your project, defined by a single JSON file. `gulp-cfn-deploy`
provides several tasks that make it easier to manage your stack.

You can define your stack's resources in separate JSON files, and
`gulp-cfn-deploy` will merge them when you're ready to deploy or update the
stack. Your resource files will also be passed through a
[Handlebars.js](https://aws.amazon.com/) compiler, allowing you to use
variables and helpers in your resource templates.


## Usage

```javacsript
require('gulp-cfn-deploy')({
  stackName: 'my-stack'
  context: {
    fooVar: 'foo',
    anotherVar: 'bar'
  }
});
```


## Tasks

The following tasks are provided:

**cfn:build**  
Compiles all .json files in templateDir and merges them into a single file
under buildDir.

**cfn:validate**  
*runs cfn:build*  
Runs cfn:build and validates the resulting CloudFormation template using the
validator from aws-sdk.

**cfn:deploy**  
*runs cfn:validate*  
Builds and validates the final CloudFormation template and creates (or updates)
the stack stackName.

**cfn:status**  
Display the status of the stack.

**cfn:resources**  
Display the status of individual stack resources.

**cfn:log**  
Display all log events associated with the stack.


## Options

**stackName**  
*Required*  
The name of the stack you want to dpeloy

**context**  
Default: `{}`  
Context object passed to Handlebars compiler

**handlebars**  
Default: `{}`  
Options passed to Handlebars compiler

**merge**  
Default: `{}`  
Options passed to [gulp-merge-json](https://github.com/joshswan/gulp-merge-json).

**templateDir**  
Default: `'cfn'`  
Directory that contains your resource template JSON files

**buildDir**  
Default: `'build/cfn'`  
Directory to output comiled resource template

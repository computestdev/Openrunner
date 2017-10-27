# Contributing to Openrunner

We are excited to have your help building Openrunner &mdash; both the tool and the community behind it. Please read the project overview and guidelines for contributing bug reports and new code, or it might be hard for the community to help you with your issue or pull request.

## Project overview

Before we jump into detailed guidelines for opening and triaging issues and submitting pull requests, here is some information about how our project is structured and resources you should refer to as you start contributing. 

### Ways to contribute

There are many ways to contribute to the Openrunner Project. Here’s a list of technical contributions with increasing levels of involvement and required knowledge of Openrunner’s code and operations.  
- [Contributing to documentation](#documentation)
- [Reporting a bug](#reporting-a-bug)
- [Finding work](#finding-work)
- [Submitting pull requests](#submitting-pull-requests)

If you can think of any changes to the project, [documentation](https://github.com/computestdev/Openrunner/wiki) that would improve the contributor experience, let us know by opening an issue!

### Finding work

We curate specific issues that would make great pull requests for community contributors by applying the [`good first issue` label](https://github.com/computestdev/Openrunner/labels/good%20first%20issue)).

### Project roles

We’ve just begun to create more defined project roles for Openrunner. Here are descriptions of the existing project roles, along with the current contributors taking on those roles today. 

#### Reviewer

Our most regular and experienced contributors sometimes move on to doing code reviews for pull requests, and have input into which pull requests should be merged. 

Current Reviewers:
- [@jvanderwel-ct](https://github.com/jvanderwel-ct)

#### Core Committer 

For now, the only contributors with commit access to computestdev/Openrunner are employees of Computest Development B.V., the company that sponsors the Openrunner project. 

### Tracking project work

Right now, the best place to track the work being done on Openrunner is to take a look at the latest release milestone: https://github.com/computestdev/Openrunner/milestones

## Reporting a bug

We welcome clear bug reports.  If you've found a bug in Openrunner that
isn't a security risk, please file a report in
[our issue tracker](https://github.com/computestdev/Openrunner/issues). Before you file your issue, **search** to see if it has already been reported. If so, up-vote (using GitHub reactions) or add additional helpful details to the existing issue to show that it's affecting multiple people.

> There is a separate procedure for security-related issues.  If the
> issue you've found contains sensitive information or raises a security
> concern, email <code>cottow[]()@[]()computest.nl</code> instead, which
> will page the security team.

A Openrunner script  has many moving parts, and it's often difficult to
reproduce a bug based on just a few lines of code.  So your report
should include a reproduction recipe.  By making it as easy as possible
for others to reproduce your bug, you make it easier for your bug to be
fixed. **It's likely that without a reproduction, contributors won't look into fixing your issue and it will end up being closed.**

**A single code snippet is _not_ a reproduction recipe and neither is an entire application.**

A reproduction recipe works like this:

 * Create a new Openrunner script that displays the bug with as little code as possible. Try to delete any code that is unrelated to the precise bug you're reporting.  Ideally, try to use as few source files as possible so that it's easy to see the whole reproduction on one screen, rather than making a large number of small files, even if that's not how you'd choose to structure an app.

 * Create a new GitHub repository (or gist) with a name like `Openrunner-select-bug` (or if you're adding a new reproduction recipe to an existing issue, `Openrunner-issue-321`) and push your code to it.

 * Reproduce the bug from scratch, starting with a `git clone` command. Copy and paste the entire command-line input and output, starting with the `git clone` command, into the issue description of a new GitHub issue. Also describe any web browser interaction you need to do.

 * Note the released version of the Openrunner in your issue. If you reproduced the issue using a checkout of Openrunner instead of using a released version, specify what commit in the Openrunner repository was checked out.

 * Mention what operating system you're using and what browser (if any).

If you want to submit a pull request that fixes your bug, that's even better. We love getting bugfix pull requests.  Just make sure they pass all the existing tests and include additional tests to cover your changes.  Read further down for more details on proposing changes to core code.

## Feature requests

Feature requests are tracked alongside our other issues https://github.com/computestdev/Openrunner/labels/feature%20request and are assigned the "feature request" label.

Every additional feature adds a maintenance cost in addition to its value. This cost starts with the work of writing the feature or reviewing a community pull request. In addition to the core code change, attention needs to be paid to documentation, tests, maintainability, how the feature interacts with existing and speculative Openrunner features, cross-browser/platform support, user experience/API considerations, etc.  Once the feature is shipped, it then becomes the community's responsibility to fix future bugs related to the feature. In case the original author disappears, it's important that the feature has good tests and is widely used in order to be maintainable by other contributors.

Feature requests should be well specified and unambiguous to have the greatest chance of being worked on by a contributor.

## Documentation

If you'd like to contribution to Openrunner's documentation, head over to https://github.com/computestdev/Openrunner/wiki.

### Proposing your change

You'll have the best chance of getting a change in if you can build consensus in the community for it. Start by creating a well specified feature request as a Github issue: https://github.com/computestdev/Openrunner/labels/feature%20request

Help drive discussion and advocate for your feature on the Github ticket. The higher the demand for the feature and the greater the clarity of it's specification will determine the likelihood of a core contributor prioritizing your feature.

Split features up into smaller, logically separate chunks. It is unlikely that large and complicated PRs will be merged.

If you are working on your feature, leave a comment letting people know you're working on it and you can begin work on the code.

### Submitting pull requests

Once you've come up with a good design, go ahead and submit a pull request (PR). Please open an new issue (or comment on an existing issue that you are going to fix) before you start to work on your change, to avoid wasted work.

When submitting a PR, please follow these guidelines:

 * Base all your work off of the **master** branch. (for example by clicking on the fork button in github)

 * Name your branch to match the feature/bug fix that you are submitting.

 * Limit yourself to one feature or bug fix per pull request.

 * Include tests that prove your code works.

 * Be sure your author field in git is properly filled out with your full name and email address so we can credit you.

### Need help with your pull request?

If you need help with a pull request, you should start by asking questions in the issue which it pertains to.  If you feel that your pull request is almost ready or needs feedback which can only be demonstrated with code, go ahead and open a pull-request with as much progress as possible.  By including a "[Work in Progress]" note in the subject, project contributors will know you need help!

Submitting a pull request is no guarantee it will be accepted, but contributors will do their best to help move your pull request toward release.

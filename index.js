const core = require('@actions/core');
const github = require('@actions/github');


function linkedIssuesAndProjects(pullRequestId) {
  // We have it return info about all the linked projects and their fields,
  // so that we can identify the field that needs to be updated.
  
  return `query {
    node(id: "${pullRequestId}") {
      ... on PullRequest {
        id
        title
        number
        closingIssuesReferences(first: 50) {
          nodes {
            id
            number
            title
            projectsV2(first: 50) {
              nodes {
                id
                title
                fields(first: 50) {
                  nodes {
                    ... on ProjectV2SingleSelectField {
                      id
                      name
                      options {
                        id
                        name
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }`
}

function extractProjectItemId(projectId, itemId) {
  // The id we need for the item is not it's own id, but rather the id of its association with the project.
  // There is no way to query for that directly. So instead we tell GH to add the item to the project. This
  // has no effect since it is part of it already, but it does return the needed id.

  return `mutation {
    addProjectV2ItemById(input: {projectId: "${projectId}", contentId:"${itemId}"}) {
      item {
        id
      }
    }
  }`
}

function updateProjectFieldMutation(projectId, projectItemId, fieldId, fieldValue) {
  return `mutation {
    updateProjectV2ItemFieldValue(input: {projectId: "${projectId}", itemId: "${projectItemId}", fieldId: "${fieldId}", value: {singleSelectOptionId: "${fieldValue}"}}) {
      clientMutationId
    }
  }`
}

async function main() {
  try {
    const pr = github.context.payload.pull_request;

    if (!pr) {
      console.log(`Payload doesn't contain a pull request, so nothing to be done.`);
      return;
    }

    const token = core.getInput('github-token')
    const projectFieldName = core.getInput('project-field-name')
    const projectFieldValue = core.getInput('project-field-value')

    const octokit = github.getOctokit(token);

    // Find all issues this PR will close
    const linkedIssuesQuery = linkedIssuesAndProjects(pr.node_id);
    core.debug("query:", linkedIssuesQuery);

    const { node } = await octokit.graphql(linkedIssuesQuery);
    core.debug("node:", JSON.stringify(node, undefined, 2));

    console.log(JSON.stringify(node, undefined, 2));

    for (let issue of node.closingIssuesReferences.nodes) {
      for (let project of issue.projectsV2.nodes) {
        // Find the id of target field in this project
        const field = project.fields.nodes.find(f => f.name === projectFieldName)

        if (!field) {
          console.log(`Issue #${issue.number} has a card on project ${project.name}, but there is no field named ${projectFieldName}, so it won't be moved.`);
          continue;
        }

        // Find the id of the target value for this field
        const options = field.options

        const targetValue = options.find( v => v.name === projectFieldValue )

        if (!targetValue) {
          console.log(`Issue #${issue.number} has a card on project ${project.name}, but the field named ${projectFieldName} doesn't have an option ${projectFieldValue}, so it won't be moved.`);
          continue;
        }

        // Extract the id of the association of this item to this project
        const projectItemIdQuery = extractProjectItemId(project.id, issue.id)

        core.debug("projectItemIdQuery:", projectItemIdQuery);

        const { addProjectV2ItemById } = await octokit.graphql(projectItemIdQuery);

        core.debug("addProjectV2ItemById:", JSON.stringify(addProjectV2ItemById, undefined, 2));

        console.log(JSON.stringify(addProjectV2ItemById, undefined, 2));

        // Make the actual change to the field
        console.log(`Setting issue #${issue.number} field "${projectFieldName}" to "${projectFieldValue}" in project "${project.title}"`)

        const updateMutation = updateProjectFieldMutation(project.id, addProjectV2ItemById.item.id, field.id, targetValue.id)
        
        console.log(updateMutation)

        await octokit.graphql(updateMutation)
      }
    }
  } catch (error) {
    core.setFailed(error.message);
  }
}

main();
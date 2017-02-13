/*global define*/
Utils = {};

Utils.getBaseUrl = function () {
    var cp = this.getUrlParam('cp', true);
    return this.getUrlParam('xdm_e', true) + ( cp ? cp : '') + '/atlassian-connect';
};

Utils.getUrlParam = function (param, escape) {
    try {
        var regex = new RegExp(param + '=([^&]+)'),
            data = regex.exec(window.location.search)[1];
        // decode URI with plus sign fix.
        return (escape) ? window.decodeURIComponent(data.replace(/\+/g, '%20')) : data;
    } catch (e) {
        return undefined;
    }
};

var webUrl = "https://philips-optimization.atlassian.net";
var apiUrl = "/rest/api/2";
var createMeta;
var newEpic;
var storiesToClone;
var epicNameField;
var epicLinkField;
function logAction(action) {$("body").append("<br/><span>" + action + "</span> ");}
function logSuccess(success) {$("body").append("<span class='tool-success'>" + success + "</span>");}
function logError(error) {$("body").append("<span class='tool-error'>" + error + "</span>");}

function loadCreateMeta() {
    return new Promise(function(resolve) {
        AP.request({
            url: apiUrl + "/issue/createmeta?expand=projects.issuetypes.fields",
            type: 'GET',
            dataType: 'json',
            success: function(response) {
                var data = $.parseJSON(response);

                /* create hash */
                var project = data.projects.filter(function(project) {
                    return project.key == "OP";
                }).pop();
                var meta = project.issuetypes.reduce(function(map, issueType) {
                    map[issueType.name] = issueType.fields;
                    return map;
                }, {});

                /* find epic name and link field */
                epicNameField = Object.keys(meta.Epic).filter(function(field) {
                    return meta.Epic[field].name == "Epic Name";
                }).pop();
                epicLinkField = Object.keys(meta.Story).filter(function(field) {
                    return meta.Story[field].name == "Epic Link";
                }).pop();

                resolve(meta);
            }
        });
    });
}

function mapIssue(issue, meta) {
    var metaFields = meta[issue.fields.issuetype.name];
    var mappedIssue = {
        fields: {}
    };
    for (var field in metaFields) {
        mappedIssue.fields[field] = issue.fields[field];
    };

    /* change destination project */
    mappedIssue.fields.project = {
        key: "OP"
    };

    /* hacks */
    delete mappedIssue.fields.attachment;
    if (typeof mappedIssue.fields.description != "undefined" && !mappedIssue.fields.description) {
        mappedIssue.fields.description = "";
    }
    return mappedIssue;
}

function cloneIssue(issue) {
    return new Promise(function(resolve) {

        /* create issue should only contain createMeta fields */
        var createIssue = mapIssue(issue, createMeta);

        /* create issue */
        AP.request({
            url: apiUrl + "/issue",
            type: 'POST',
            dataType: 'json',
            data: JSON.stringify(createIssue),
            contentType: "application/json",
            success: function(response) {
                var data = $.parseJSON(response);
                console.log("issue created!", data);
                issue.id = data.id;
                issue.key = data.key;
                resolve(issue);
            },
            error: function(response) {
                var data = $.parseJSON(response);
                logError(data.statusText);
            }
        });
    });
}

function findEpicStories(epic) {
    return new Promise(function(resolve) {
        AP.request({
            url: apiUrl + "/search",
            data: {
                jql: "'Epic Link' = " + epic.key,
                fields: "*all,-comment"
            },
            type: 'GET',
            dataType: 'json',
            success: function(response) {
                var data = $.parseJSON(response);
                resolve(data.issues);
            }
        });
    });
}

function cloneNextEpicStory() {
    return new Promise(function(resolve) {
        var story = storiesToClone.shift();
        var newStory = {
            fields: story.fields
        };
        newStory.fields[epicLinkField] = newEpic.key;
        logAction("cloning story");
        console.log("cloning story", newStory);
        cloneIssue(newStory).then(function() {
            logSuccess("done");
            if (storiesToClone.length) {
                cloneNextEpicStory().then(function() {
                    resolve();
                });
            } else {
                resolve();
            }
        });
    });
}

function findTemplateEpics() {
    return new Promise(function(resolve) {
        AP.request({
            url: apiUrl + "/search",
            data: {
                jql: "project = TEM AND issuetype = Epic",
                fields: "*all,-comment"
            },
            type: 'GET',
            dataType: 'json',
            success: function (response) {
                var data = $.parseJSON(response);
                var $ul = data.issues.reduce(function($ul, epic) {
                    var $li = $("<li><a href='#'>" + epic.fields.summary + "</a></li>");

                    /* when epic is selected ... */
                    $li.on("click", function() {
                        $("body").html("");
                        logAction("Cloning epic ...");
                        newEpic = {
                            fields: epic.fields
                        };
                        newEpic.fields.summary = "New Epic! " + newEpic.fields.summary;
                        newEpic.fields[epicNameField] = newEpic.fields.summary;

                        /* clone epic */
                        cloneIssue(newEpic).then(function() {
                            logSuccess("done");
                            logAction("Loading epic issues ...");

                            /* find epic stories */
                            return findEpicStories(epic);
                        }).then(function(stories) {
                            logSuccess("done");

                            /* clone epic stories */
                            storiesToClone = stories;
                            return cloneNextEpicStory();
                        }).then(function() {
                            logAction("redirecting to new epic ...");

                            window.top.location.href = webUrl + "/browse/" + newEpic.key;
                        });
                    });

                    $ul.append($li);
                    return $ul;
                }, $("<ul></ul>"));
                resolve($ul);
            }
        });
    });
}

$(document).ready(function () {
    var allJS = Utils.getBaseUrl() + '/all.js';
    $.getScript(allJS, function () {

        /* load create metadata */
        loadCreateMeta().then(function (meta) {
            createMeta = meta;
            console.log("createMeta", meta);

            /* find Template epics */
            return findTemplateEpics();
        }).then(function ($content) {

            /* show list of template epics */
            $("body").html($content);
            $content.before("<p>Select epic to clone:</p>");
        });


        console.log("testinggg", window.top);
    });
});
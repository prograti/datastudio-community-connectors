/** Google Data Studio Community Connector for Qiita. */

var connector = connector || {}; // namespace

connector.debug = false;

connector.config = [
  {
    name: 'qiitaDataType',
    type: 'SELECT_SINGLE',
    displayName: 'Qiitaデータタイプ',
    helpText: '取得したいデータのタイプを選択してください。',
    options: [
      {
        label: '投稿',
        value: 'posts'
      },
      {
        label: 'いいね',
        value: 'likes'
      }
    ]
  }
];

connector.schema = {
  posts: [
    {
      name: 'title',
      label: 'タイトル',
      description: '投稿のタイトル',
      dataType: 'STRING',
      semantics: {
        semanticType: 'TEXT',
        conceptType: 'DIMENSION'
      }
    },
    {
      name: 'likes_count',
      label: 'いいね数',
      description: '投稿に対する いいね の総数',
      dataType: 'NUMBER',
      semantics: {
        semanticType: 'NUMBER',
        semanticGroup: 'NUMERIC',
        conceptType: 'METRIC'
      }
    },
    {
      name: 'comments_count',
      label: 'コメント数',
      description: '投稿に対するコメントの総数',
      dataType: 'NUMBER',
      semantics: {
        semanticType: 'NUMBER',
        semanticGroup: 'NUMERIC',
        conceptType: 'METRIC'
      }
    },
    {
      name: 'created_at',
      label: '投稿日',
      description: '投稿した日',
      dataType: 'STRING',
      semantics: {
        semanticType: 'YEAR_MONTH_DAY',
        semanticGroup: 'DATE_TIME',
        conceptType: 'DIMENSION'
      }
    }
  ],
  likes: [
    {
      name: 'id',
      label: 'ID',
      description: '投稿のID',
      dataType: 'STRING',
      semantics: {
        semanticType: 'TEXT',
        conceptType: 'DIMENSION'
      }
    },
    {
      name: 'title',
      label: 'タイトル',
      description: '投稿のタイトル',
      dataType: 'STRING',
      semantics: {
        semanticType: 'TEXT',
        conceptType: 'DIMENSION'
      }
    },
    {
      name: 'created_at',
      label: 'いいね作成日',
      description: 'ユーザーが いいね した日',
      dataType: 'STRING',
      semantics: {
        semanticType: 'YEAR_MONTH_DAY',
        semanticGroup: 'DATE_TIME',
        conceptType: 'DIMENSION'
      }
    },
    {
      name: 'likes_count',
      label: 'いいね数',
      description: 'いいね数',
      dataType: 'NUMBER',
      defaultAggregationType: 'COUNT',
      semantics: {
        semanticType: 'NUMBER',
        semanticGroup: 'NUMERIC',
        conceptType: 'METRIC'
      }
    }
  ]
};

connector.sample_data = {
  posts: [
    {
      title: 'test',
      likes_count: 1,
      comments_count: 2,
      created_at: '2018-01-01T00:00:00+00:00'
    }
  ]
};

// Required functions
function getAuthType() {
  return connector.invoke('getAuthType', null);
}

// Required functions
function getConfig(request) {
  return connector.invoke('getConfig', request);
}

// Required functions
function getSchema(request) {
  return connector.invoke('getSchema', request);
}

// Required functions
function getData(request) {
  return connector.invoke('getData', request);
}

// Required functions for OAuth2
function isAuthValid() {
  var service = connector.getOAuthService();
  if (service == null) {
    return false;
  }
  return service.hasAccess();
}

// Required functions for OAuth2
function get3PAuthorizationUrls() {
  var service = connector.getOAuthService();
  if (service == null) {
    return '';
  }
  return service.getAuthorizationUrl();
}

// Required functions for OAuth2
function authCallback(request) {
  var authorized = connector.getOAuthService().handleCallback(request);
  if (authorized) {
    return HtmlService.createHtmlOutput('認証に成功しました。');
  } else {
    return HtmlService.createHtmlOutput('認証が拒否されました。');
  }
}

// Required functions for OAuth2
function resetAuth() {
  var service = connector.getOAuthService();
  service.reset();
}


connector.getAuthType = function() {
  var response = {'type': 'OAUTH2'};
  return response;
};

connector.getConfig = function(request) {
  var config = {configParams: connector.config};
  return config;
};

connector.getSchema = function(request) {
  return {schema: connector.schema[request.configParams.qiitaDataType || 'posts']};
};

connector.getData = function(request) {
  var dataType = request.configParams.qiitaDataType || 'posts';
  var dataFunc = connector.dataFuncs[dataType];
  return dataFunc(request);
}

connector.dataFuncs = {};

connector.dataFuncs.posts = function(request) {
  var dataSchema = connector.assembleSchema(request);
  var posts = connector.getMyPosts();
  
  var data = posts.map(function(post) {
    var values = [];
    dataSchema.forEach(function(field) {
      switch (field.name) {
        case 'title':
          values.push(post.title);
          break;
        case 'likes_count':
          values.push(post.likes_count);
          break;
        case 'comments_count':
          values.push(post.comments_count);
          break;
        case 'created_at':
          values.push(connector.formatDate(post.created_at));
          break;
        default:
          values.push('');
      }
    });
    return { values: values };
  });

  return {
    schema: dataSchema,
    rows: data
  };
}

connector.getMyPosts = function() {
  var access_token = connector.getAccessToken();
  var response = UrlFetchApp.fetch('https://qiita.com/api/v2/authenticated_user/items?page=1&per_page=100', 
                                   {headers: {'Authorization': 'Bearer ' + access_token}});
  
  var totalPages = connector.getTotalPages(response);
  var posts = [];
  for (var i = 1; i <= totalPages; i++) {
    if (i > 1) {
      response = UrlFetchApp.fetch('https://qiita.com/api/v2/authenticated_user/items?page=' + i + '&per_page=100', 
                                   {headers: {'Authorization': 'Bearer ' + access_token}});
    }
    try {
      var currentPostData = JSON.parse(response);
    } catch (e) {
      throw new Error('取得した投稿データの解析に失敗しました。');
    }
    posts = posts.concat(currentPostData);
  }
  return posts;
}

connector.dataFuncs.likes = function(request) {
  var dataSchema = connector.assembleSchema(request);
  var posts = connector.getMyPosts();
  var access_token = connector.getAccessToken();
  
  var likes = posts.map(function(post) {
    var response = UrlFetchApp.fetch('https://qiita.com/api/v2/items/' + post.id + '/likes?page=1&per_page=100',
                                     {headers: {'Authorization': 'Bearer ' + access_token}});
    
    var totalPages = connector.getTotalPages(response);
    var likesOfPost = [];
    for (var i = 1; i <= totalPages; i++) {
      if (i > 1) {
        response = UrlFetchApp.fetch('https://qiita.com/api/v2/items/' + post.id + '/likes?page=' + i + '&per_page=100', 
                                     {headers: {'Authorization': 'Bearer ' + access_token}});
      }
      try {
        var currentLikeData = JSON.parse(response);
      } catch (e) {
        throw new Error('取得した いいね データの解析に失敗しました。');
      }
      likesOfPost = likesOfPost.concat(currentLikeData);
    }
    
    return likesOfPost.map(function(like) {
      return {
        id: post.id,
        title: post.title,
        created_at: like.created_at
      };
    });
  }).reduce(function(a, b) {
    return a.concat(b);
  });

  var data = likes.map(function(like) {
    var values = [];
    dataSchema.forEach(function(field) {
      switch (field.name) {
        case 'id':
          values.push(like.id);
          break;
        case 'title':
          values.push(like.title);
          break;
        case 'created_at':
          values.push(connector.formatDate(like.created_at));
          break;
        case 'likes_count':
          values.push(1);
          break;
        default:
          values.push('');
      }
    });
    return { values: values };
  });
  
  return {
    schema: dataSchema,
    rows: data
  };
}

connector.assembleSchema = function(request) {
  var dataType = request.configParams.qiitaDataType || 'posts';
  return request.fields.map(function(field) {
    for (var i = 0; i < connector.schema[dataType].length; i++) {
      if (connector.schema[dataType][i].name == field.name) {
        return connector.schema[dataType][i];
      }
    }
  });
}

connector.getTotalPages = function(response) {
  var headers = response.getAllHeaders();
  if ('Link' in headers) {
    var link = headers['Link'];
    var lastPageRegEx = /\?page=([0-9]+)&per_page=[0-9]+>; rel="last"/;
    var matches = link.match(lastPageRegEx);
    var lastPageStr = matches[1];
    return parseInt(lastPageStr, 10);
  } else {
    return 1;
  }
};

connector.formatDate = function(isoFormatString) {
  if (!isoFormatString) {
    return '';
  }
  
  // 2018-01-01T00:00:00+00:00 -> 20180101
  return isoFormatString.slice(0, 10).replace(/-/g, '');
}

connector.invoke = function(functionName, parameter) {
  if (connector.debug) {
    var paramString = JSON.stringify(parameter, null, 2);
    console.log([functionName, 'request', paramString]);
  }

  var returnValue = connector[functionName](parameter);

  if (connector.debug) {
    var returnString = JSON.stringify(returnValue, null, 2);
    console.log([functionName, 'response', returnString]);
  }

  return returnValue;
};

connector.getOAuthService = function() {
  var scriptProps = PropertiesService.getScriptProperties();
  var clientId = scriptProps.getProperty('OAUTH_CLIENT_ID');
  var clientSecret = scriptProps.getProperty('OAUTH_CLIENT_SECRET');
  
  return OAuth2.createService('qiita')
    .setAuthorizationBaseUrl('https://qiita.com/api/v2/oauth/authorize')
    .setTokenUrl('https://qiita.com/api/v2/access_tokens')
    .setClientId(clientId)
    .setClientSecret(clientSecret)
    .setTokenHeaders({
      'Content-Type': 'application/json'
    })
    .setPropertyStore(PropertiesService.getUserProperties())
    .setScope('read_qiita')
    .setCallbackFunction('authCallback')
    .setTokenPayloadHandler(connector.tokenHandler);
}

connector.tokenHandler = function(payload) {
  return JSON.stringify(payload);
}

connector.getAccessToken = function() {
  var savedToken = connector.getOAuthService().getToken();
  if (savedToken == null) {
    throw new Error('保存されているトークンがありません。');
  }
  return savedToken.token;
}

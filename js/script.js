(function($){
  // Search
  var $searchWrap = $('#search-form-wrap'),
    isSearchAnim = false,
    searchAnimDuration = 200;

  var $main = $('#main');
  var $searchButton = $('#sub-nav .nav-search-btn');
  var currentPath = window.location.pathname;
  var isHomePage = currentPath === '/' || currentPath === '/index.html';
  var isArchiveOrCategoryPage = /^\/(archives|categories)(\/|$)/.test(currentPath);
  var isArticleListPage = $('.article').length > 1 || isHomePage || isArchiveOrCategoryPage;
  var isDetailPage = $('.article').length === 1 && !isArticleListPage;

  var initLoadingScreen = function(){
    var $loader = $('#blog-loading-screen');
    if (!$loader.length) return;

    var loaderSeenKey = 'carrot-blog-loader-seen';
    var isFirstVisit = !sessionStorage.getItem(loaderSeenKey);
    var $gifs = $loader.find('.blog-loading-gif');
    var gifIndex = 0;
    var activateGif = function(index){
      var $gif = $gifs.eq(index);
      var lazySrc = $gif.attr('data-src');

      if (lazySrc && !$gif.attr('src')) {
        $gif.attr('src', lazySrc);
      }

      $gifs.removeClass('is-active');
      $gif.addClass('is-active');
    };

    if (!isFirstVisit) {
      $loader.addClass('is-hidden');
      setTimeout(function(){
        $loader.remove();
      }, 500);
      return;
    }

    var gifTimer = setInterval(function(){
      gifIndex = (gifIndex + 1) % $gifs.length;
      activateGif(gifIndex);
    }, 900);

    var waitForImage = function(img){
      return new Promise(function(resolve){
        if (!img || img.complete) {
          resolve();
          return;
        }

        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', resolve, { once: true });
      });
    };

    var waitForMusic = function(){
      return new Promise(function(resolve){
        var firstTrack = '/assets/music/mao-buyi-yicheng-shanlu-fixed.mp3';
        var previewAudio = new Audio();
        var done = false;

        var finish = function(){
          if (done) return;
          done = true;
          window.__carrotMusicWarmup = previewAudio;
          resolve();
        };

        previewAudio.preload = 'auto';
        previewAudio.addEventListener('canplaythrough', finish, { once: true });
        previewAudio.addEventListener('canplay', finish, { once: true });
        previewAudio.addEventListener('error', finish, { once: true });
        previewAudio.src = firstTrack;
        previewAudio.load();
        setTimeout(finish, 4000);
      });
    };

    var visibleImages = Array.prototype.slice.call(document.images).filter(function(img){
      return !img.closest('#blog-loading-screen');
    }).slice(0, 8);

    var minimumShow = new Promise(function(resolve){
      setTimeout(resolve, 1400);
    });
    var maximumWait = new Promise(function(resolve){
      setTimeout(resolve, 5200);
    });
    var pageReady = Promise.all(visibleImages.map(waitForImage).concat([waitForMusic(), minimumShow]));

    Promise.race([pageReady, maximumWait]).then(function(){
      sessionStorage.setItem(loaderSeenKey, '1');
      clearInterval(gifTimer);
      $loader.addClass('is-hidden');
      setTimeout(function(){
        $loader.remove();
      }, 520);
    });
  };

  initLoadingScreen();

  if ($main.length && $searchWrap.length && $searchButton.length){
    var $homeButton = $('<a id="blog-home-link" href="/"><span class="fa fa-home"></span><span class="home-button-text">主页</span></a>');
    $searchButton.html('<span class="fa fa-search"></span>');
    $('#sub-nav .nav-icon[href="/atom.xml"]').remove();

    if (isDetailPage){
      $searchButton.remove();
      $searchWrap.remove();
    } else {
      var $searchPanel = $('<div id="blog-search-panel"></div>');

      if (!isHomePage){
        $searchPanel.addClass('has-home-link').append($homeButton);
      }

      $searchWrap.find('.search-form-submit').remove();
      $searchPanel.append($searchButton).append($searchWrap);
      $main.before($searchPanel);

      if ($('#sidebar').length) {
        $('<a id="mobile-sidebar-link" href="#sidebar">分类 / 归档</a>').insertAfter($searchPanel);
      }
    }
  }

  var startSearchAnim = function(){
    isSearchAnim = true;
  };

  var stopSearchAnim = function(callback){
    setTimeout(function(){
      isSearchAnim = false;
      callback && callback();
    }, searchAnimDuration);
  };

  $('.nav-search-btn').on('click', function(){
    if (isSearchAnim) return;

    if ($searchWrap.closest('#blog-search-panel').length && $.trim($('.search-form-input').val())) {
      runLocalSearch();
      return;
    }

    startSearchAnim();
    $searchWrap.addClass('on');
    stopSearchAnim(function(){
      $('.search-form-input').focus();
    });
  });

  $('.search-form-input').on('blur', function(){
    if (!$searchWrap.closest('#blog-search-panel').length){
      startSearchAnim();
      $searchWrap.removeClass('on');
      stopSearchAnim();
    }
  });

  var $localSearchResults = $('<div id="local-search-results" aria-live="polite"></div>');
  var searchIndex = [];
  var searchIndexReady = false;
  var searchIndexPromise = null;

  if ($('#blog-search-panel').length) {
    $('#blog-search-panel').append($localSearchResults);
  }

  var normalizeText = function(text){
    return $.trim(String(text || '').replace(/\s+/g, ' '));
  };

  var collectArticleLinks = function(){
    var links = {};

    $('a[href]').each(function(){
      var href = $(this).attr('href');
      var title = normalizeText($(this).text());

      if (!href || href.indexOf('/20') !== 0 || href.slice(-1) !== '/') return;

      links[href] = links[href] || {
        url: href,
        title: title
      };

      if (title && title.length > (links[href].title || '').length) {
        links[href].title = title;
      }
    });

    return Object.keys(links).map(function(url){
      return links[url];
    });
  };

  var makeExcerpt = function(text, query){
    var content = normalizeText(text);
    var lower = content.toLowerCase();
    var index = query ? lower.indexOf(query.toLowerCase()) : -1;
    var start = index > 50 ? index - 50 : 0;

    return content.slice(start, start + 180);
  };

  var upsertSearchItem = function(item){
    var existing = searchIndex.find(function(record){
      return record.url === item.url;
    });

    if (existing) {
      $.extend(existing, item);
      return;
    }

    searchIndex.push(item);
  };

  var buildSearchIndex = function(){
    searchIndex = [];
    searchIndexReady = false;

    $('.article').each(function(){
      var $article = $(this);
      var $title = $article.find('.article-title').first();
      var title = normalizeText($title.text());
      var url = $title.attr('href');

      if (!title || !url) return;

      var date = normalizeText($article.find('.article-date').first().text());
      var category = normalizeText($article.find('.article-category').first().text());
      var excerpt = normalizeText($article.find('.article-entry').first().text()).slice(0, 180);

      var content = normalizeText($article.find('.article-entry').first().text());

      upsertSearchItem({
        title: title,
        url: url,
        meta: normalizeText([date, category].join(' · ')),
        excerpt: excerpt,
        content: content,
        haystack: normalizeText([title, date, category, excerpt, content].join(' ')).toLowerCase()
      });
    });

    $('.archive-article').each(function(){
      var $item = $(this);
      var $title = $item.find('.archive-article-title').first();
      var title = normalizeText($title.text());
      var url = $title.attr('href');

      if (!title || !url || searchIndex.some(function(item){ return item.url === url; })) return;

      var date = normalizeText($item.find('.archive-article-date').first().text());

      upsertSearchItem({
        title: title,
        url: url,
        meta: date,
        excerpt: '',
        content: '',
        haystack: normalizeText([title, date].join(' ')).toLowerCase()
      });
    });

    var links = collectArticleLinks();

    links.forEach(function(link){
      if (searchIndex.some(function(item){ return item.url === link.url; })) return;

      upsertSearchItem({
        title: link.title || link.url,
        url: link.url,
        meta: '',
        excerpt: '',
        content: '',
        haystack: normalizeText([link.title, link.url].join(' ')).toLowerCase()
      });
    });

    searchIndexPromise = $.when.apply($, links.map(function(link){
      return $.get(link.url).then(function(html){
        var doc = $.parseHTML(html, document, true);
        var $doc = $(doc);
        var title = normalizeText($doc.find('.article-title').first().text()) || link.title;
        var date = normalizeText($doc.find('.article-date').first().text());
        var category = normalizeText($doc.find('.article-category').first().text());
        var content = normalizeText($doc.find('.article-entry').first().text());
        var meta = normalizeText([date, category].join(' · '));
        var excerpt = content.slice(0, 180);

        upsertSearchItem({
          title: title,
          url: link.url,
          meta: meta,
          excerpt: excerpt,
          content: content,
          haystack: normalizeText([title, meta, content].join(' ')).toLowerCase()
        });
      }).catch(function(){
        return null;
      });
    })).always(function(){
      searchIndexReady = true;

      var keyword = $('.search-form-input').val();
      if (normalizeText(keyword) && $localSearchResults.hasClass('is-visible')) {
        renderSearchResults(keyword);
      }
    });

    if (!links.length) {
      searchIndexReady = true;
    }
  };

  var renderSearchResults = function(keyword){
    var query = normalizeText(keyword).toLowerCase();

    if (!query) {
      $localSearchResults.removeClass('is-visible').empty();
      return;
    }

    if (!searchIndex.length) buildSearchIndex();

    var results = searchIndex.filter(function(item){
      return item.haystack.indexOf(query) !== -1;
    }).slice(0, 10);

    if (!searchIndexReady && !results.length && query.length > 1) {
      $localSearchResults
        .addClass('is-visible')
        .html('<div class="local-search-empty">正在加载文章内容...</div>');
      return;
    }

    if (!results.length) {
      $localSearchResults
        .addClass('is-visible')
        .html('<div class="local-search-empty">没有找到相关文章</div>');
      return;
    }

    var html = results.map(function(item){
      return [
        '<a class="local-search-result" href="' + item.url + '">',
          '<strong>' + item.title + '</strong>',
          item.meta ? '<span>' + item.meta + '</span>' : '',
          item.content ? '<p>' + makeExcerpt(item.content, query) + '</p>' : (item.excerpt ? '<p>' + item.excerpt + '</p>' : ''),
        '</a>'
      ].join('');
    }).join('');

    $localSearchResults.addClass('is-visible').html(html);
  };

  var runLocalSearch = function(){
    renderSearchResults($('.search-form-input').val());
  };

  buildSearchIndex();

  $('.search-form').on('submit', function(e){
    if ($(this).closest('#blog-search-panel').length) {
      e.preventDefault();
      runLocalSearch();
    }
  });

  $('.search-form-input').on('keydown', function(e){
    if (e.key === 'Enter' && $(this).closest('#blog-search-panel').length) {
      e.preventDefault();
      runLocalSearch();
    }
  }).on('input', function(){
    if ($(this).closest('#blog-search-panel').length) {
      renderSearchResults($(this).val());
    }
  });

  $(document).on('click', function(e){
    if (!$(e.target).closest('#blog-search-panel').length) {
      $localSearchResults.removeClass('is-visible');
    }
  });

  $('.article-share-link').remove();
  $('.article-footer').filter(function(){
    return $.trim($(this).text()) === '' && $(this).find('a').length === 0;
  }).remove();

  // Share
  $('body').on('click', function(){
    $('.article-share-box.on').removeClass('on');
  }).on('click', '.article-share-link', function(e){
    e.stopPropagation();

    var $this = $(this),
      url = $this.attr('data-url'),
      encodedUrl = encodeURIComponent(url),
      id = 'article-share-box-' + $this.attr('data-id'),
      title = $this.attr('data-title'),
      offset = $this.offset();

    if ($('#' + id).length){
      var box = $('#' + id);

      if (box.hasClass('on')){
        box.removeClass('on');
        return;
      }
    } else {
      var html = [
        '<div id="' + id + '" class="article-share-box">',
          '<input class="article-share-input" value="' + url + '">',
          '<div class="article-share-links">',
            '<a href="https://twitter.com/intent/tweet?text=' + encodeURIComponent(title) + '&url=' + encodedUrl + '" class="article-share-twitter" target="_blank" title="Twitter"><span class="fa fa-twitter"></span></a>',
            '<a href="https://www.facebook.com/sharer.php?u=' + encodedUrl + '" class="article-share-facebook" target="_blank" title="Facebook"><span class="fa fa-facebook"></span></a>',
            '<a href="http://pinterest.com/pin/create/button/?url=' + encodedUrl + '" class="article-share-pinterest" target="_blank" title="Pinterest"><span class="fa fa-pinterest"></span></a>',
            '<a href="https://www.linkedin.com/shareArticle?mini=true&url=' + encodedUrl + '" class="article-share-linkedin" target="_blank" title="LinkedIn"><span class="fa fa-linkedin"></span></a>',
          '</div>',
        '</div>'
      ].join('');

      var box = $(html);

      $('body').append(box);
    }

    $('.article-share-box.on').hide();

    box.css({
      top: offset.top + 25,
      left: offset.left
    }).addClass('on');
  }).on('click', '.article-share-box', function(e){
    e.stopPropagation();
  }).on('click', '.article-share-box-input', function(){
    $(this).select();
  }).on('click', '.article-share-box-link', function(e){
    e.preventDefault();
    e.stopPropagation();

    window.open(this.href, 'article-share-box-window-' + Date.now(), 'width=500,height=450');
  });

  // Caption
  $('.article-entry').each(function(i){
    $(this).find('img').each(function(){
      if ($(this).parent().hasClass('fancybox') || $(this).parent().is('a')) return;

      var alt = this.alt;

      if (alt) $(this).after('<span class="caption">' + alt + '</span>');

      $(this).wrap('<a href="' + this.src + '" data-fancybox=\"gallery\" data-caption="' + alt + '"></a>')
    });

    $(this).find('.fancybox').each(function(){
      $(this).attr('rel', 'article' + i);
    });
  });

  if ($.fancybox){
    $('.fancybox').fancybox();
  }

  if (isArticleListPage){
    $('body').addClass('article-list-page');

    $('.article').each(function(){
      var $article = $(this);
      var $entry = $article.find('.article-entry').first();

      if (!$entry.length || $entry.outerHeight() <= 420) return;

      $article.addClass('has-collapsible-entry');
      $entry.addClass('is-collapsed');

      var detailUrl = $article.find('.article-title').first().attr('href');
      if (!detailUrl) return;

      $article.find('.article-inner').first()
        .attr('role', 'link')
        .attr('tabindex', '0')
        .attr('aria-label', '阅读全文')
        .on('click', function(e){
          if ($(e.target).closest('a, button, input, textarea, select, label').length) return;
          window.location.href = detailUrl;
        })
        .on('keydown', function(e){
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            window.location.href = detailUrl;
          }
        });

      var $button = $('<a class="article-collapse-toggle" aria-label="阅读全文">⌵</a>').attr('href', detailUrl);
      $entry.after($button);
    });
  }

  // 侧栏下拉
  $('#sidebar .widget-wrap').each(function(index){
    var $wrap = $(this);
    var $title = $wrap.find('.widget-title').first();
    var $widget = $wrap.find('.widget').first();

    if (!$title.length || !$widget.length) return;

    var panelId = 'sidebar-widget-panel-' + index;
    var $button = $('<button type="button" class="sidebar-widget-toggle" aria-expanded="true"></button>');

    $button.html('<span>' + $title.text() + '</span><span class="sidebar-widget-arrow">⌵</span>');
    $button.attr('aria-controls', panelId);
    $widget.attr('id', panelId);
    $title.replaceWith($button);

    $button.on('click', function(){
      var isCollapsed = $wrap.toggleClass('is-collapsed').hasClass('is-collapsed');
      $button.attr('aria-expanded', !isCollapsed);
    });
  });

  // 侧栏功能按钮：主页与音乐
  var musicTracks = [
    {
      title: '毛不易 - 一程山路',
      src: '/assets/music/mao-buyi-yicheng-shanlu-fixed.mp3',
      type: 'audio/mpeg',
      playable: true
    },
    {
      title: '庄达菲 - 湘江中路',
      src: '/assets/music/zhuang-dafei-xiangjiang-zhonglu-fast.mp3',
      type: 'audio/mpeg'
    }
  ];
  var currentTrackIndex = 0;
  var $sidebar = $('#sidebar');

  if ($sidebar.length){
    var $sidebarTools = $('<div id="sidebar-tools"></div>');

    if (!isHomePage){
      var $sidebarHome = $('<a id="sidebar-home-link" href="/" title="回到主页" aria-label="回到主页"><span class="fa fa-home"></span></a>');
      $sidebarTools.append($sidebarHome);
    }

    var musicHtml = [
      '<div id="sidebar-music-player">',
        '<button type="button" id="sidebar-music-toggle" title="音乐卡片" aria-label="音乐卡片"><span class="music-icon">♪</span></button>',
        '<div id="sidebar-music-panel" aria-hidden="true">',
          '<div id="sidebar-music-title">等待音乐</div>',
          '<input id="sidebar-music-progress" type="range" min="0" max="100" value="0" disabled>',
          '<div id="sidebar-music-controls">',
            '<button type="button" id="sidebar-music-stop" title="播放 / 暂停"><span class="music-playback-icon">⏸</span></button>',
            '<button type="button" id="sidebar-music-next" title="播放下一首"><span class="music-next-icon">⏭</span></button>',
          '</div>',
          '<audio id="sidebar-audio" preload="none"></audio>',
        '</div>',
      '</div>'
    ].join('');

    $sidebarTools.append(musicHtml);
    $sidebar.append($sidebarTools);
    $('body').append('<button type="button" id="floating-music-toggle" title="播放 / 暂停音乐" aria-label="播放 / 暂停音乐"><span class="music-icon">♪</span></button>');

    var $musicPlayer = $('#sidebar-music-player');
    var $musicPanel = $('#sidebar-music-panel');
    var $audio = $('#sidebar-audio');
    var audio = $audio.get(0);
    var $musicTitle = $('#sidebar-music-title');
    var $progress = $('#sidebar-music-progress');
    var $floatingMusicToggle = $('#floating-music-toggle');
    var playableTracks = musicTracks;
    var musicStateKey = 'carrot-blog-music-state-v2';
    var lastMusicStateSave = 0;
    var pendingRestoreTime = null;

    if (audio) {
      audio.volume = 0.25;
      playableTracks = musicTracks.filter(function(track){
        return track.playable !== false && /\.mp3$/i.test(track.src);
      });

      if (!playableTracks.length) {
        playableTracks = musicTracks.filter(function(track){
          return /\.mp3$/i.test(track.src);
        });
      }
    }

    var setMusicPanel = function(isOpen){
      $musicPlayer.toggleClass('is-open', isOpen);
      $musicPanel.toggleClass('is-open', isOpen);
      $musicPanel.attr('aria-hidden', !isOpen);
      $musicPanel.css(isOpen ? {
        display: 'block',
        maxHeight: '150px',
        height: 'auto',
        opacity: 1,
        padding: '14px',
        borderColor: '#ddd'
      } : {
        display: 'none',
        maxHeight: '0',
        height: '0',
        opacity: 0,
        padding: '0 14px',
        borderColor: 'transparent'
      });
    };

    var updateMusicButtons = function(){
      var isPlaying = audio && !audio.paused && !audio.ended;
      $('#sidebar-music-toggle, #floating-music-toggle').toggleClass('is-playing', isPlaying);
      $('#sidebar-music-stop .music-playback-icon').text(isPlaying ? '⏸' : '▶');
    };

    var saveMusicState = function(force){
      if (!audio) return;

      var now = Date.now();
      if (!force && now - lastMusicStateSave < 1200) return;
      lastMusicStateSave = now;

      var track = playableTracks[currentTrackIndex];

      try {
        localStorage.setItem(musicStateKey, JSON.stringify({
          src: track ? track.src : audio.getAttribute('src'),
          index: currentTrackIndex,
          currentTime: pendingRestoreTime !== null ? pendingRestoreTime : (audio.currentTime || 0),
          paused: audio.paused || audio.ended,
          panelOpen: $musicPanel.hasClass('is-open'),
          updatedAt: now
        }));
      } catch (e) {}
    };

    var prepareTrack = function(index){
      if (!playableTracks.length || !audio) return null;

      currentTrackIndex = (index + playableTracks.length) % playableTracks.length;
      var track = playableTracks[currentTrackIndex];

      if (audio.getAttribute('src') !== track.src) {
        audio.src = track.src;
      }

      audio.volume = 0.25;
      $musicTitle.text(track.title || ('音乐 ' + (currentTrackIndex + 1)));
      $progress.prop('disabled', false);

      return track;
    };

    var loadTrack = function(index){
      if (!playableTracks.length || !audio) {
        $musicTitle.text('等待音乐');
        $progress.val(0).prop('disabled', true);
        return;
      }

      var track = prepareTrack(index);
      if (!track) return;
      var playPromise = audio.play();

      if (playPromise && playPromise.catch) {
        playPromise.catch(function(){
          $musicTitle.text((track.title || ('音乐 ' + (currentTrackIndex + 1))) + '（点击音乐按钮播放）');
          updateMusicButtons();
          saveMusicState(true);
        });
      }
    };

    var playCurrentTrack = function(){
      if (!audio) return;

      if (!audio.src) {
        loadTrack(currentTrackIndex);
        return;
      }

      var playPromise = audio.play();

      if (playPromise && playPromise.catch) {
        playPromise.catch(function(){
          var track = playableTracks[currentTrackIndex];
          $musicTitle.text((track && track.title ? track.title : '音乐') + '（点击音乐按钮播放）');
          updateMusicButtons();
          saveMusicState(true);
        });
      }
    };

    var toggleMusicPanel = function(){
      var isOpen = $musicPanel.hasClass('is-open');
      setMusicPanel(!isOpen);

      if (!isOpen && audio && (!audio.src || audio.paused || audio.ended)) {
        playCurrentTrack();
      }

      updateMusicButtons();
      saveMusicState(true);
    };

    var toggleMusicPlayback = function(){
      if (!audio) return;

      if (!audio.src || audio.paused || audio.ended) {
        playCurrentTrack();
      } else {
        audio.pause();
      }

      updateMusicButtons();
      saveMusicState(true);
    };

    $('#sidebar-music-toggle').on('click', function(){
      toggleMusicPanel();
    });

    $floatingMusicToggle.on('click', function(){
      toggleMusicPlayback();
    });

    $('#sidebar-music-stop').on('click', function(){
      toggleMusicPlayback();
    });

    $('#sidebar-music-next').on('click', function(){
      loadTrack(currentTrackIndex + 1);
      updateMusicButtons();
      saveMusicState(true);
    });

    $audio.on('timeupdate', function(){
      if (!audio || !audio.duration) return;
      $progress.val((audio.currentTime / audio.duration) * 100);
      saveMusicState(false);
    });

    $audio.on('ended', function(){
      loadTrack(currentTrackIndex + 1);
    });

    $audio.on('play pause ended', function(){
      updateMusicButtons();
      saveMusicState(true);
    });

    $audio.on('canplay playing', function(){
      var track = playableTracks[currentTrackIndex];
      if (track && $musicTitle.text().indexOf('正在接上播放') !== -1) {
        $musicTitle.text(track.title || ('音乐 ' + (currentTrackIndex + 1)));
      }
      updateMusicButtons();
      saveMusicState(false);
    });

    $audio.on('error', function(){
      $musicTitle.text('当前歌曲暂时无法播放，正在切下一首');
      updateMusicButtons();
      setTimeout(function(){
        loadTrack(currentTrackIndex + 1);
      }, 600);
    });

    $progress.on('input', function(){
      if (!audio || !audio.duration) return;
      audio.currentTime = audio.duration * (Number(this.value) / 100);
      saveMusicState(true);
    });

    var restoreMusicState = function(){
      if (!audio || !playableTracks.length) return;

      var state = null;

      try {
        state = JSON.parse(localStorage.getItem(musicStateKey) || 'null');
      } catch (e) {}

      if (!state || !state.src) return;

      var savedIndex = playableTracks.findIndex(function(track){
        return track.src === state.src;
      });

      currentTrackIndex = savedIndex >= 0 ? savedIndex : 0;
      var track = prepareTrack(currentTrackIndex);
      if (!track) return;
      audio.preload = state.paused ? 'metadata' : 'auto';
      var restoredTime = Math.max(0, Number(state.currentTime) || 0);
      pendingRestoreTime = restoredTime > 0.2 ? restoredTime : null;

      var applyRestoreTime = function(){
        if (pendingRestoreTime === null) return;
        try {
          audio.currentTime = Math.min(pendingRestoreTime, audio.duration || pendingRestoreTime);
          pendingRestoreTime = null;
        } catch (e) {}
      };

      if (pendingRestoreTime) {
        audio.addEventListener('loadedmetadata', applyRestoreTime, { once: true });
        audio.addEventListener('canplay', applyRestoreTime, { once: true });
      }

      setMusicPanel(!!state.panelOpen);

      if (!state.paused) {
        $musicTitle.text((track.title || '音乐') + '（正在接上播放...）');
        audio.load();
        var playPromise = audio.play();

        if (playPromise && playPromise.catch) {
          playPromise.catch(function(){
            $musicTitle.text((track.title || '音乐') + '（点击音乐按钮继续播放）');
          });
        }
      } else if (pendingRestoreTime) {
        audio.load();
      }

      updateMusicButtons();
    };

    $(window).on('pagehide beforeunload', function(){
      saveMusicState(true);
    });
    $(document).on('pointerdown click', 'a[href]', function(){
      var href = $(this).attr('href');
      if (!href || href.indexOf('#') === 0 || /^https?:\/\//i.test(href) || /^mailto:/i.test(href)) return;
      saveMusicState(true);
    });
    $(window).on('pageshow', function(){
      updateMusicButtons();
    });
    document.addEventListener('visibilitychange', function(){
      if (document.visibilityState === 'hidden') {
        saveMusicState(true);
      }
    });
    restoreMusicState();
  }

  // 轻量桌宠
  var petMessages = [
    '喵，今天也要好好写博客。',
    '我在这里陪你看文章。',
    '点点分类，可能会发现新东西。',
    '记得给音乐播放器喂一首歌。'
  ];

  var $pet = $([
    '<button type="button" id="blog-pet" aria-label="桌宠小猫">',
      '<span class="blog-pet-bubble">喵</span>',
      '<span class="blog-pet-ear blog-pet-ear-left"></span>',
      '<span class="blog-pet-ear blog-pet-ear-right"></span>',
      '<span class="blog-pet-face">',
        '<span class="blog-pet-eye blog-pet-eye-left"></span>',
        '<span class="blog-pet-eye blog-pet-eye-right"></span>',
        '<span class="blog-pet-mouth">ω</span>',
      '</span>',
    '</button>'
  ].join(''));

  $('body').append($pet);

  $pet.on('click', function(){
    var message = petMessages[Math.floor(Math.random() * petMessages.length)];
    $pet.find('.blog-pet-bubble').text(message);
    $pet.addClass('is-talking');

    clearTimeout($pet.data('talkTimer'));
    $pet.data('talkTimer', setTimeout(function(){
      $pet.removeClass('is-talking');
      $pet.find('.blog-pet-bubble').text('喵');
    }, 2600));
  });

  // Mobile nav
  var $container = $('#container'),
    isMobileNavAnim = false,
    mobileNavAnimDuration = 200;

  var startMobileNavAnim = function(){
    isMobileNavAnim = true;
  };

  var stopMobileNavAnim = function(){
    setTimeout(function(){
      isMobileNavAnim = false;
    }, mobileNavAnimDuration);
  }

  $('#main-nav-toggle').on('click', function(){
    if (isMobileNavAnim) return;

    startMobileNavAnim();
    $container.toggleClass('mobile-nav-on');
    stopMobileNavAnim();
  });

  $('#wrap').on('click', function(){
    if (isMobileNavAnim || !$container.hasClass('mobile-nav-on')) return;

    $container.removeClass('mobile-nav-on');
  });
})(jQuery);

(() => {
  // Utils
  const $ = sel => document.querySelector(sel);
  const randPin = () => Math.floor(100000 + Math.random()*900000).toString();

  // Elements
  const landing = $('#landing');
  const hostSetup = $('#host-setup');
  const hostLobby = $('#host-lobby');
  const playerJoin = $('#player-join');
  const playerLobby = $('#player-lobby');
  const quizScreen = $('#quiz-screen');
  const leaderboard = $('#leaderboard');

  // Buttons
  $('#btn-host').onclick = () => show('host-setup');
  $('#btn-join').onclick = () => show('player-join');
  $('#back-landing-1').onclick = $('#back-landing-2').onclick = () => show('landing');

  let localState = {mode:null, pin:null, playerName:null, hostName:null, game:null};

  function show(id){[landing,hostSetup,hostLobby,playerJoin,playerLobby,quizScreen,leaderboard].forEach(s=>s.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
  }

  // Create game
  $('#create-game').onclick = () => {
    const host = $('#host-name').value.trim() || 'Host';
    const title = $('#game-title').value.trim() || 'MindQuest';
    const pin = randPin();
    const game = {pin, title, host, players:[], state:'lobby', questions:[], current: -1, startedAt: null, answers:{}};
    localStorage.setItem('mq_game_'+pin, JSON.stringify(game));
    localState.mode='host'; localState.pin=pin; localState.hostName=host; localState.game=game;

    $('#game-pin').textContent = pin;
    $('#players-count').textContent = 0;
    $('#questions-json').value = JSON.stringify(sampleQuestions(), null, 2);
    show('host-lobby');
    startHostPoll();
  }

  // Save questions
  $('#save-questions').onclick = () => {
    try{
      const data = JSON.parse($('#questions-json').value);
      const g = JSON.parse(localStorage.getItem('mq_game_'+localState.pin));
      g.questions = data;
      localStorage.setItem('mq_game_'+localState.pin, JSON.stringify(g));
      alert('Saved ✔');
    }catch(e){alert('Invalid JSON')}
  }
  $('#add-sample').onclick = ()=> $('#questions-json').value = JSON.stringify(sampleQuestions(), null, 2);

  // Join game
  $('#join-game').onclick = ()=>{
    const name = $('#player-name').value.trim();
    const pin = $('#join-pin').value.trim();
    if(!name || !pin){$('#join-error').textContent='Enter name and pin';return}
    const raw = localStorage.getItem('mq_game_'+pin);
    if(!raw){$('#join-error').textContent='Game not found';return}
    const g = JSON.parse(raw);
    // add player if not exists
    if(!g.players.find(p=>p.name===name)){
      g.players.push({name, score:0,id: Date.now()+Math.random().toString(36).slice(2)});
      localStorage.setItem('mq_game_'+pin, JSON.stringify(g));
    }
    localState.mode='player'; localState.pin=pin; localState.playerName=name; localState.game=g;
    $('#lobby-game-title').textContent = g.title; $('#lobby-pin').textContent = pin;
    show('player-lobby');
    startPlayerPoll();
  }

  // Polling for host and players
  let hostInterval=null, playerInterval=null;
  function startHostPoll(){
    if(hostInterval) clearInterval(hostInterval);
    hostInterval = setInterval(()=>{
      const raw = localStorage.getItem('mq_game_'+localState.pin);
      if(!raw) return;
      const g = JSON.parse(raw);
      $('#players-count').textContent = g.players.length;
      // if started -> go to quiz as host
      if(g.state === 'started'){
        localState.game = g;
        clearInterval(hostInterval);
        startQuizAsHost();
      }
    },800);
  }

  function startPlayerPoll(){
    if(playerInterval) clearInterval(playerInterval);
    playerInterval = setInterval(()=>{
      const raw = localStorage.getItem('mq_game_'+localState.pin);
      if(!raw) return;
      const g = JSON.parse(raw);
      // update players list
      const ul = $('#players-list'); ul.innerHTML='';
      g.players.forEach(p=>{const li=document.createElement('li'); li.textContent = p.name + (p.name===localState.playerName ? ' (you)':''); ul.appendChild(li)});
      // if started -> go to quiz
      if(g.state === 'started'){
        clearInterval(playerInterval);
        startQuizAsPlayer();
      }
    },700);
  }

  // Host starts quiz
  $('#start-quiz').onclick = ()=>{
    const raw = localStorage.getItem('mq_game_'+localState.pin);
    if(!raw) return alert('Game missing');
    const g = JSON.parse(raw);
    if(!g.questions || g.questions.length===0) return alert('Add some questions first');
    g.state='started'; g.current=0; g.startedAt=Date.now(); g.answers={};
    localStorage.setItem('mq_game_'+localState.pin, JSON.stringify(g));
  }

  $('#end-game').onclick = ()=>{
    localStorage.removeItem('mq_game_'+localState.pin);
    alert('Game ended');
    show('landing');
  }

  // Quiz logic (host view)
  let questionTimer=null; let remaining=15;
  function startQuizAsHost(){
    localState.game = JSON.parse(localStorage.getItem('mq_game_'+localState.pin));
    show('quiz-screen');
    $('#quiz-title').textContent = localState.game.title + ' — Host view';
    renderQuestion();
    // poll for player answers to show live results
    questionTimer = setInterval(()=>{
      updateHostAnswersView();
    },600);
  }

  function updateHostAnswersView(){
    const g = JSON.parse(localStorage.getItem('mq_game_'+localState.pin));
    localState.game = g;
    // when current becomes -1 means finished
    if(g.current < 0){clearInterval(questionTimer); showLeaderboard(g);}
  }

  // Quiz logic (player view)
  function startQuizAsPlayer(){
    localState.game = JSON.parse(localStorage.getItem('mq_game_'+localState.pin));
    show('quiz-screen');
    $('#quiz-title').textContent = localState.game.title + ' — Player';
    pollForQuestion();
  }

  let playerPollForQuestion=null;
  function pollForQuestion(){
    if(playerPollForQuestion) clearInterval(playerPollForQuestion);
    playerPollForQuestion = setInterval(()=>{
      const g = JSON.parse(localStorage.getItem('mq_game_'+localState.pin));
      if(!g) return;
      // if game finished
      if(g.current < 0){ clearInterval(playerPollForQuestion); showLeaderboard(g); return }
      // if new question index
      const q = g.questions[g.current];
      if(q) renderQuestionForPlayer(q);
    },700);
  }

  function renderQuestion(){
    const g = JSON.parse(localStorage.getItem('mq_game_'+localState.pin));
    if(!g) return;
    const idx = g.current;
    if(idx<0 || idx>=g.questions.length){
      // finished
      g.state='finished'; g.current = -1; localStorage.setItem('mq_game_'+localState.pin, JSON.stringify(g));
      showLeaderboard(g); return;
    }
    const q = g.questions[idx];
    // show question
    $('#question-text').textContent = q.q;
    const answers = $('#answers'); answers.innerHTML='';
    q.options.forEach((opt,i)=>{
      const b = document.createElement('button'); b.className='answer-btn'; b.textContent = opt; b.onclick = ()=>{ /* host cannot answer */ };
      answers.appendChild(b);
    });
    // start countdown that when ends will move to next question after short reveal
    let t = q.time || 15; remaining = t; $('#quiz-timer').textContent = remaining;
    const countdown = setInterval(()=>{
      remaining--; $('#quiz-timer').textContent = remaining;
      if(remaining<=0){ clearInterval(countdown);
        // show correct and move next after 3s
        revealCorrectThenNext(q.correct);
      }
    },1000);
  }

  function revealCorrectThenNext(correctIndex){
    const g = JSON.parse(localStorage.getItem('mq_game_'+localState.pin));
    // mark players scores based on answers gathered in g.answers
    for(const pid in g.answers){
      const ansObj = g.answers[pid];
      const player = g.players.find(p=>p.id===ansObj.id);
      if(!player) continue;
      if(ansObj.answer === correctIndex){ player.score = (player.score||0) + Math.max(5, remaining+5); }
    }
    // move to next
    g.current++;
    if(g.current >= g.questions.length){ g.current = -1; }
    localStorage.setItem('mq_game_'+localState.pin, JSON.stringify(g));
    if(g.current === -1){ showLeaderboard(g); }
    else{ renderQuestion(); }
  }

  // Player rendering and answering
  function renderQuestionForPlayer(q){
    $('#question-text').textContent = q.q;
    $('#quiz-timer').textContent = q.time || 15;
    const answers = $('#answers'); answers.innerHTML='';
    q.options.forEach((opt,i)=>{
      const b = document.createElement('button'); b.className='answer-btn'; b.textContent = opt; b.onclick = ()=>{
        // save answer locally to game.answers
        const raw = localStorage.getItem('mq_game_'+localState.pin);
        if(!raw) return;
        const g = JSON.parse(raw);
        g.answers = g.answers || {};
        g.answers[localState.playerName] = {id: (g.players.find(p=>p.name===localState.playerName)||{}).id, answer:i, at:Date.now()};
        localStorage.setItem('mq_game_'+localState.pin, JSON.stringify(g));
        // highlight selection
        document.querySelectorAll('.answer-btn').forEach(x=>x.disabled=true);
        b.classList.add('selected');
      };
      answers.appendChild(b);
    });
  }

  // Show leaderboard
  function showLeaderboard(g){
    show('leaderboard');
    const ol = $('#leaderboard-list'); ol.innerHTML='';
    // sort players
    const players = (g.players||[]).slice().sort((a,b)=> (b.score||0)-(a.score||0));
    players.forEach(p=>{
      const li = document.createElement('li'); li.textContent = ${p.name} — ${p.score||0} pts; ol.appendChild(li);
    });
  }

  $('#replay-quiz').onclick = ()=>{
    // reset scores and start again
    const raw = localStorage.getItem('mq_game_'+localState.pin); if(!raw) return;
    const g = JSON.parse(raw);
    g.players.forEach(p=>p.score=0); g.current=0; g.state='started'; g.answers={}; localStorage.setItem('mq_game_'+localState.pin, JSON.stringify(g));
    startHostPoll();
  }
  $('#back-home').onclick = ()=>{ show('landing'); }

  // a small sample questions set
  function sampleQuestions(){
    return [{q:'Which language runs in a web browser?', options:['Python','C','JavaScript','Kotlin'], correct:2, time:15},
            {q:'What does CSS stand for?', options:['Central Style Sheets','Cascading Style Sheets','Computer Style Sheets','Creative Style Sheets'], correct:1, time:15},
            {q:'Which HTML tag is used for a paragraph?', options:['<p>','<para>','<ps>','<paragraph>'], correct:0, time:12}];
  }

  // init: show landing
  show('landing');
})();
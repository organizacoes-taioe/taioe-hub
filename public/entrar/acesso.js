/* O código de 4 dígitos (PLANO, decisão 19): a Edge Function acesso do ambiente (taioe-infra)
   confere o Turnstile e os limites, manda o email com o código e o botão e, conferido o código
   ou o botão, devolve um token de uso único, que aqui vira a sessão do Supabase. Comum a
   /entrar/, /entrar/confirmar/ e /entrar/excluir/. */
(function () {
  'use strict';
  var I = TaioeI18n, t = I.t;

  // A resposta da função, também quando ela recusa (status 4xx/5xx com { ok: false, motivo }).
  async function chamar(corpo) {
    var r = await TaioeSessao.cliente().functions.invoke('acesso', { body: corpo });
    if (!r.error) return r.data;
    var ctx = r.error.context;
    if (ctx && typeof ctx.json === 'function') {
      try { return await ctx.json(); } catch (e) { /* sem corpo: cai no erro de rede */ }
    }
    throw r.error;
  }

  // O token de uso único vira a sessão (amr «otp», aceito pelo hook de token).
  async function entrar(resposta) {
    var r = await TaioeSessao.cliente().auth.verifyOtp({ token_hash: resposta.token_hash, type: 'email' });
    if (r.error) throw r.error;
    return r.data;
  }

  // «45 s», «3 min», «2 h 5 min»: as mesmas abreviações nas três línguas
  function tempo(segundos) {
    var s = Math.max(1, Math.ceil(segundos || 60));
    if (s < 60) return s + ' s';
    var m = Math.ceil(s / 60);
    if (m < 60) return m + ' min';
    return Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + (m % 60) + ' min' : '');
  }

  // A frase de cada recusa, na língua da página
  function mensagem(resp) {
    switch (resp && resp.motivo) {
      case 'email_invalido': return t('erro.email');
      case 'codigo_invalido': return t('comum.codigo-4');
      case 'captcha': return t('erro.captcha');
      case 'aguarde': return t('erro.aguarde', { tempo: tempo(resp.espera) });
      case 'limite_hora': case 'limite_dia': return t('erro.limite-email', { tempo: tempo(resp.espera) });
      case 'limite_ip': return t('erro.limite-ip', { tempo: tempo(resp.espera) });
      case 'errado': return t(resp.restantes === 1 ? 'erro.errado-1' : 'erro.errado', { n: resp.restantes });
      case 'esgotado': return t('erro.esgotado');
      case 'expirado': case 'sem_codigo': return t('erro.vencido');
      case 'sem_conta': return t('erro.sem-conta');
      case 'envio': return t('erro.envio');
      default: return t('erro.geral');
    }
  }

  window.TaioeAcesso = {
    pedir: function (email, captcha) { return chamar({ acao: 'pedir', email: email, captcha: captcha }); },
    verificar: function (email, codigo, criar) {
      return chamar({ acao: 'verificar', email: email, codigo: codigo, criar: criar !== false });
    },
    link: function (sinal) { return chamar({ acao: 'link', sinal: sinal }); },
    entrar: entrar, mensagem: mensagem
  };
})();

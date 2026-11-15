# Guia do projeto
[English](../en/GUIDE.md) · [Início](../../README.md)

## Arquitetura e uso
O servidor C++ serve arquivos web e APIs locais. JavaScript controla perfis, telemetria, simulação, exames e idiomas. SQLite armazena os dados importados; a inicialização importa OSD-569, OSD-13 e OSD-323. O painel médico lê os CSV via HTTP. Fotos e idioma ficam no armazenamento do navegador, no dispositivo utilizado.

Fluxo: escolher tripulante → consultar telemetria/modelo → comparar coletas pré/pós-voo. O botão de evento escolhe um perfil aleatório e abre a simulação. O vídeo inicia sem som; use os controles para ativá-lo.

## Catálogo e proveniência
| Fonte | Conteúdo | Aplicação |
|---|---|---|
| [OSD-569](https://osdr.nasa.gov/bio/repo/data/studies/OSD-569) | Hemograma humano Inspiration4 | Exames individuais históricos |
| [OSD-575](https://osdr.nasa.gov/bio/repo/data/studies/OSD-575) | Painel metabólico humano Inspiration4 | Exames individuais históricos |
| OSD-654/662 | DXA, massa magra, força e histologia em camundongos | Pesquisa, excluídos do histórico humano |
| OSD-13/323 | Experimentos com células humanas | Pesquisa, sem prontuário individual |
| NASA RadLab | 15.473 registros DosTel da ISS, 9–17 abril 2022 | Radiação ambiental, µGy/h |
| JAXA Kibo ICE | Temperatura/posição/tempo de experimento | Telemetria de equipamento |

Cada pasta de extração contém metadados/manifestos; verifique URLs, unidades, cobertura e SHA-256. Não combine estudos diferentes como se fossem da mesma pessoa. O campo dose equivalente do CSV RadLab local está vazio.

C001 → Tripulante 1, C002 → Tripulante 2, C003 → Tripulante 3, C004 → Tripulante 4. A associação é fictícia. A interface permite selecionar coletas, mostra variações e referências do ensaio. Nomes de exames/unidades conservam campos originais. Insights descrevem mudanças observadas e solicitam revisão; não demonstram doença nem efeito causal do voo.

## Pesquisa humana complementar
[SPRINT em astronautas](https://www.nature.com/articles/s41526-020-00111-x) avalia músculo, osso, força e exercício. [SPRINT em repouso no leito](https://pubmed.ncbi.nlm.nih.gov/38328821/) estuda humanos em modelo terrestre. Identificados como evidência complementar; dados individuais não foram importados nem atribuídos aos perfis. Faltam medidas musculares individuais para prescrever aumento percentual de exercício.

## Atualizar dados
```sh
python3 "extracao de dados/extrair_tudo.py"
```
Os scripts usam a biblioteca padrão Python; a extração requer internet e pode sobrescrever os arquivos baixados. Preserve uma cópia caso precise reproduzir a versão atual. Scripts específicos: NASA OSDR, metabólico, cenários imunes, musculoesquelético, muscular, radiação Ax-1 e JAXA Kibo. Veja o README da pasta de extração.

## APIs locais
- `/api/human-cbc`: CSV humano OSD-569.
- `/api/metabolic-data`: CSV humano OSD-575.
- `/api/ax1-radiation-data`: CSV RadLab.
- `/api/musculoskeletal-data`, `/api/lean-mass-data`, `/api/muscle-force-data`: dados animais.
- `/locales/pt-BR.json`, `/locales/en.json`: traduções.

## Áudio e mídia
`dados/roteiro-evento.txt` contém o texto português; `dados/evento-simulado.wav` é áudio sintetizado de referência. A fala atual usa síntese do navegador. O vídeo em `web/assets/emergency-response.mp4` é material fornecido pelo grupo; não foi validado como procedimento oficial NASA.

## Verificação e manutenção
Execute `make dashboard` e `node --check web/medical.js`, `node --check web/i18n.js`. Confira manualmente os quatro perfis, seletores de coleta, idiomas, vídeo e evento. Não publique bancos locais nem caches. Não há autenticação de produção. Tradução integral e revisão clínica são pendências.

# SISP · Sistema de Saúde Preventiva

[English](README.en.md) · [Documentação](docs/pt-BR/GUIA.md)

Protótipo do grupo para o NASA Space Apps: painel de saúde de quatro tripulantes, telemetria simulada, visualização anatômica 3D e exames humanos históricos da NASA OSDR.

## Executar
Requisitos: compilador C/C++ com C++17, Make e SQLite3 com cabeçalhos de desenvolvimento. Python 3 é necessário apenas para atualizar os dados.

```sh
make dashboard
make run
```

Abra http://127.0.0.1:8080/. Execute os comandos na raiz do projeto. Porta alternativa: `./build/monitoramento-dashboard 8081`.

## Funcionalidades
- Quatro perfis, fotos locais e idioma PT/EN (tradução parcial dos textos médicos extensos).
- Modelos muscular e esquelético.
- Telemetria e evento cardíaco simulados, vídeo e orientações de resposta.
- Hemograma e painel metabólico humanos pré/pós-voo com comparações individuais.

## Dados e limites
Tripulante 1–4 corresponde, apenas na demonstração, a C001–C004 de Inspiration4. Os exames OSD-569/575 são históricos. Os sinais vitais e a recuperação cardíaca em 30 segundos são simulados. O sistema não estabelece diagnóstico nem calcula prescrição individual de exercício.

Os arquivos animais OSD-654/662 e os experimentos celulares OSD-13/323 não são históricos clínicos dos tripulantes. RadLab contém radiação ambiental da ISS, sem dose pessoal. Consulte o [guia dos dados e arquitetura](docs/pt-BR/GUIA.md).

## Estrutura
- `src/`, `include/`: backend C/C++ e SQLite.
- `web/`: interface, traduções, modelos e mídia.
- `dados/`: CSV originais, metadados, manifestos e narração.
- `extracao de dados/`: scripts Python para atualizar fontes públicas.
- `docs/pt-BR/`, `docs/en/`: documentação equivalente.
- `build/`, `runtime/`: arquivos gerados, ignorados pelo Git.

O dashboard usa SQLite em disco em `runtime/monitoramento.db`; `make run-demo` executa a demonstração anterior de RAM/SQLite.

## Antes de publicar
O código original e a documentação do SISP estão disponíveis sob a [licença MIT](LICENSE). Dados, dependências, modelos GLB, avatares, áudio e vídeo de terceiros continuam sujeitos às respectivas licenças e atribuições; a licença MIT do projeto não altera esses direitos.

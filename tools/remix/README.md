# Pipeline de DJ edit

Ferramentas para montar intros/edits de show a partir de uma faixa de áudio.
O áudio NÃO é versionado aqui (repo público). Trabalhe com os arquivos fora do repo.

1. `python3 -I analyze.py <faixa> <pasta>`: BPM, grade de compassos, energia e mapa visual.
2. `python3 -I render.py <faixa> <pasta>/analysis.json <arranjo.json> <saida>`: monta o edit em
   48 kHz/24 bits (+ MP3 320k + folha de cues com timecodes).
3. `python3 -I qc.py <saida>.wav <saida>_cues.txt <pasta_qc> <beat_sec>`: LUFS, true peak, cliques
   nos cortes, quedas, correlação estéreo e balanço espectral por seção.

Dependências: `pip install numpy scipy librosa soundfile matplotlib pyloudnorm` + ffmpeg.

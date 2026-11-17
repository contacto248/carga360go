from pathlib import Path

def test_required_files():
    root=Path(__file__).parents[1]
    for f in ['app/main.py','db/schema.sql','docker-compose.yml','.env.example','GUIA-DESPLIEGUE.md']:
        assert (root/f).exists()

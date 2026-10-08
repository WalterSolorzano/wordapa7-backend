# WordAPA7 — Despliegue en Oracle Cloud Always Free (gratis de por vida)

Opcion gratis de verdad: VM ARM (Ampere A1) con 24GB RAM y 4 OCPUs incluidos
en el tier Always Free. Corre 24/7, tiene disco persistente y alcanza de sobra
para FastAPI + LibreOffice. Mejor que el pack de estudiante (Azure seria
US$100 por 12 meses; aca no se paga nada, nunca).

## 1. Crear la cuenta (una vez)
1. Entra a https://cloud.oracle.com y crea una cuenta **Free Tier**.
   Pide tarjeta de credito solo para verificar identidad; NO cobra nada.
2. Usa una region con capacidad Ampere disponible (p. ej. Sao Paulo / Santiago
   si estas en LATAM). Si te da "Out of capacity", proba otra region.

## 2. Crear la VM
1. Menu -> **Compute -> Instances -> Create instance**.
2. Nombre: `wordapa7`. Imagen: **Oracle Linux 8** (o la que traiga Docker).
3. Shape: **VM.Standard.A1.Flex** -> OCPUs: **4**, Memory: **24 GB**
   (la cota Always Free por cuenta es 4 OCPUs + 24GB totales).
4. **SSH keys**: subi una publica (o que Oracle genere una; guarda la privada).
5. Create. Anota la **IP publica** de la instancia.

## 3. Abrir el puerto 80 en el firewall
1. Menu -> **Networking -> Virtual cloud networks** -> tu VCN.
2. **Security lists -> Default Security List** -> Add Ingress Rules:
   Source CIDR `0.0.0.0/0`, Destination Port Range `80`.
   (Si vas a usar HTTPS despues, agregar tambien `443`.)

## 4. Preparar la carpeta de despliegue (en tu PC)
```powershell
.\deploy\oracle\prepare.ps1
```
Genera `deploy/oracle/space/` con el frontend compilado + backend + Dockerfile.

## 5. Subir y arrancar (SSH)
```bash
# desde tu PC
scp -r deploy/oracle/space/ opc@IP_PUBLICA:~/wordapa7

# dentro de la VM
ssh opc@IP_PUBLICA
sudo dnf install -y docker-ce docker-compose-plugin   # si la imagen no trae Docker
sudo systemctl enable --now docker
cd ~/wordapa7
sudo docker compose up -d --build
```

## 6. Abrir la app
```
http://IP_PUBLICA
```
- El frontend se sirve desde `/`, la API en `/api`.
- Las sesiones y documentos subidos viven en un volumen Docker (`wordapa7-data`),
  asi sobreviven reinicios y actualizaciones.

## Extras
- **Actualizar la app**: rebuild con `sudo docker compose up -d --build`.
- **HTTPS (recomendado)**: agregar Caddy (`caddy reverse-proxy`) o nginx frente
  al puerto 80 y un certificado gratuito de Let's Encrypt. Sin HTTPS, algunos
  navegadores limitan funciones (portapapeles, camara).
- **Backups**: `sudo docker run --rm -v wordapa7-data:/data -v $PWD:/backup alpine tar czf /backup/wordapa7-data.tar.gz -C /data .`

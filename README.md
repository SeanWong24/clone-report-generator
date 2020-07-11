### First, the Docker needs to be installed.

### To build the docker image
```bash
cd this-directory
docker build -t the-image-tag-that-you-like .
```

### To run initialize script
```bash
docker run \
--name name-of-the-container-that-you-like \ 
-v /absolute/path/for/git/source/directory:/source  \
-v /absolute/path/to/save/the/output:/output \
--rm -d \
the-tag-used-when-building-image \
initialize.ts \
arguments for the script
```
An example, 
```bash
docker run \
--name clone-report-generate \
-v $(pwd)/../Java:/source  \
-v $(pwd)/../output:/output \
--rm -d \
test \
initialize.ts \
/source/ master functions java /output/ 0 100
```
* ```$(pwd)``` is used for getting the currrent directory.
* ```$(pwd)/git-repo``` is the path of git repo being processed.
* ```$(pwd)``` is the path of a directory for storing the report.
---
 
* ```/source/``` is the path of mapped git repo.  
* ```master``` is the git branch to be checked out.
* ```fucntions``` is the granularity NiCad would use.
* ```java``` is the language used in the git repo.
* ```/output/``` is the path of mapped output directory.
* ```0``` and ```100``` are the min and max revisions to be processed (it would run for all revisions if not passing those two arguments).

### To check the docker's log
* Checking the logs till now
```bash
docker logs name-of-the-container
```
* following the logs (with updates), use ```Ctrl + C``` for this would just dismiss the logs but not the running docker process
```bash
docker logs -f name-of-the-container
```
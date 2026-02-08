import {Template, waitForTimeout} from 'e2b'

export const template = Template()
    .fromDockerfile("./e2b.DockerFile")
    .setStartCmd("/run.sh", waitForTimeout(30_000));
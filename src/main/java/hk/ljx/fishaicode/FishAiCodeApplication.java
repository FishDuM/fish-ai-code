package hk.ljx.fishaicode;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.EnableAspectJAutoProxy;

@SpringBootApplication
@EnableAspectJAutoProxy(exposeProxy = true)
public class FishAiCodeApplication {

    public static void main(String[] args) {
        SpringApplication.run(FishAiCodeApplication.class, args);
    }

}

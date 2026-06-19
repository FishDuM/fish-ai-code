package hk.ljx.fishaicode.controller;

import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HealthController {
    @PutMapping("/health")
    public String health() {
        return "OK";
    }

}

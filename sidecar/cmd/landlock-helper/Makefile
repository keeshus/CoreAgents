CC      ?= musl-gcc
CFLAGS  ?= -Os -static
LDFLAGS ?= -static

landlock-helper: main.c
	$(CC) $(CFLAGS) -o $@ $< $(LDFLAGS)

clean:
	$(RM) landlock-helper

.PHONY: clean
